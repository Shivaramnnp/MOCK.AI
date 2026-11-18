/**
 * MOCK.AI — Topic-wise Practice Test Engine & Adaptive Progress Tracking Service
 *
 * Implements:
 * 1. Verified Exam, Subject, Topic & Subtopic Catalog Discovery
 * 2. High-Integrity Question Pool Filtering & Deduplication
 * 3. Synthetic Practice Paper Generation with Verified Exam Marking Schemes
 * 4. Adaptive Practice Analytics & Data-Driven Weak Topic Identification
 */

import {
  ExamPaper,
  CompetitiveQuestion,
  ExamTestSession,
  TopicResultSummary,
  DifficultyResultSummary,
} from '../../types';
import {
  COMPETITIVE_EXAMS_CATALOG,
  getPapersForExam,
  registerExamPaper,
  getPaperById,
} from '../../data/exams/catalog';
import {
  getExamTaxonomy,
  findSubjectTaxonomy,
  TopicDefinition,
  SubjectTaxonomy,
} from '../taxonomy/topicTaxonomy';
import {
  getQuestionTopicMetadata,
  UNCATEGORIZED_TOPIC_ID,
} from '../taxonomy/topicClassifier';
import { ExamService } from '../examService';
import { ExamSessionService } from '../examSessionService';
import {
  TopicPracticeCloudSync,
  RemotePracticeHistoryRow,
} from './topicPracticeCloudSync';

export type ClassificationTrustLevel =
  | 'STAFF_VERIFIED'
  | 'RULE_BASED_PROVISIONAL'
  | 'PENDING_REVIEW'
  | 'UNCLASSIFIED'
  | 'REJECTED';

/**
 * Explicit classification trust model:
 * Distinguishes human/official verified classifications from legacy automated rule-based
 * provisional tags so RULE_BASED metadata never silently masquerades as staff approval.
 */
export function getClassificationTrustLevel(meta?: {
  classificationStatus?: string | null;
  classificationSource?: string | null;
  primaryTopicId?: string | null;
}): ClassificationTrustLevel {
  if (!meta || !meta.classificationStatus) return 'UNCLASSIFIED';
  const status = meta.classificationStatus;
  if (status === 'REJECTED') return 'REJECTED';
  if (status === 'PENDING_REVIEW' || status === 'REVIEW_REQUIRED') return 'PENDING_REVIEW';
  if (status === 'UNCLASSIFIED' || status === 'UNCATEGORIZED' || !meta.primaryTopicId || meta.primaryTopicId === UNCATEGORIZED_TOPIC_ID) {
    return 'UNCLASSIFIED';
  }
  if (status === 'VERIFIED') {
    if (meta.classificationSource === 'STAFF' || meta.classificationSource === 'OFFICIAL') {
      return 'STAFF_VERIFIED';
    }
    return 'RULE_BASED_PROVISIONAL';
  }
  return 'UNCLASSIFIED';
}

export interface PracticeTestConfig {
  examId: string;
  subjectId: string;
  topicIds: string[]; // one or multiple topic IDs (or subtopic IDs)
  questionCount: number; // 5, 10, 20, 30, or custom
  durationMinutes: number; // 0 if untimed
  isUntimed: boolean;
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
  source: 'pyq' | 'practice' | 'both';
  userId?: string;
  /**
   * Explicit opt-in to include RULE_BASED_PROVISIONAL questions alongside STAFF_VERIFIED.
   * Defaults strictly to FALSE so provisional questions NEVER silently enter verified pools.
   */
  includeProvisional?: boolean;
}

export interface TopicCatalogItem {
  id: string;
  name: string;
  description?: string;
  subtopics?: Array<{ id: string; name: string }>;
  /** Strictly STAFF_VERIFIED / trusted OFFICIAL questions only */
  verifiedQuestionCount: number;
  /** RULE_BASED_PROVISIONAL questions (never counted as verified) */
  provisionalQuestionCount: number;
  /** Questions awaiting staff review (PENDING_REVIEW / REVIEW_REQUIRED) */
  pendingReviewCount: number;
  /** Unclassified / uncategorized questions */
  unclassifiedCount: number;
  /** Staff-rejected questions */
  rejectedCount: number;
  pyqCount: number;
  practiceCount: number;
}

export interface SubjectCatalogItem {
  id: string;
  name: string;
  topics: TopicCatalogItem[];
  /** Strictly verified question total for this subject */
  totalQuestions: number;
  /** Provisional rule-based question total for this subject */
  provisionalQuestions: number;
  pendingReviewQuestions: number;
  unclassifiedQuestions: number;
}

export interface ExamPracticeCatalog {
  examId: string;
  examName: string;
  subjects: SubjectCatalogItem[];
  totalVerifiedQuestions: number;
  totalProvisionalQuestions: number;
  totalPendingReviewQuestions: number;
  totalUnclassifiedQuestions: number;
  totalRejectedQuestions: number;
}

export interface TopicPerformanceStat {
  topicId: string;
  topicName: string;
  subjectId?: string;
  totalAttempts: number;
  totalQuestionsAttempted: number;
  correct: number;
  wrong: number;
  unanswered: number;
  accuracy: number; // 0-100 percentage
  scoreEarned: number;
  scoreMax: number;
  lastAttemptedAt: number;
  trend: 'improving' | 'declining' | 'stable';
  isWeak: boolean;
}

export interface PracticeRecommendation {
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  accuracy: number;
  reason: string;
  recommendedQuestionCount: number;
}

export const MAX_PRACTICE_QUESTIONS = 200;

export type QuestionCountErrorCode =
  | 'NO_TOPICS_SELECTED'
  | 'NO_ELIGIBLE_QUESTIONS'
  | 'INVALID_FORMAT'
  | 'NON_POSITIVE'
  | 'EXCEEDS_ELIGIBLE'
  | 'EXCEEDS_MAX_LIMIT';

export interface QuestionCountValidationResult {
  /** What the student requested (null if custom input is not a valid integer) */
  requestedCount: number | null;
  /** Whether the request comes from custom text input rather than a preset button */
  isCustomInput: boolean;
  /** Number of verified questions matching current topic/source/difficulty filters (uncapped) */
  eligibleCount: number;
  /** Maximum valid count for this configuration: Math.min(eligibleCount, MAX_PRACTICE_QUESTIONS) */
  maxAllowed: number;
  /** True only when requestedCount is a valid integer in [1, maxAllowed] */
  isValid: boolean;
  /** Structured validation error code when !isValid */
  errorCode: QuestionCountErrorCode | null;
  /** User-facing validation/warning message when !isValid */
  message: string | null;
  /** Exact number of questions that will be generated when isValid === true (0 otherwise) */
  plannedGeneratedCount: number;
}

/**
 * Single source of truth for validating requested question count against
 * eligible verified questions and application session limits.
 */
export function validatePracticeQuestionCount(params: {
  presetCount: number;
  customInput: string;
  eligibleCount: number;
  selectedTopicCount: number;
  poolLabel?: string;
}): QuestionCountValidationResult {
  const { presetCount, customInput, eligibleCount, selectedTopicCount, poolLabel = 'verified' } = params;
  const trimmedCustom = customInput.trim();
  const isCustomInput = trimmedCustom.length > 0;
  const safeEligible = Math.max(0, Math.floor(eligibleCount));
  const maxAllowed = Math.min(safeEligible, MAX_PRACTICE_QUESTIONS);

  // 1. Parse and validate the requested count format & sign first
  let requestedCount: number | null = null;

  if (isCustomInput) {
    if (!/^[+-]?\d+$/.test(trimmedCustom)) {
      return {
        requestedCount: null,
        isCustomInput: true,
        eligibleCount: safeEligible,
        maxAllowed,
        isValid: false,
        errorCode: 'INVALID_FORMAT',
        message: 'Enter a valid whole number for the question count.',
        plannedGeneratedCount: 0,
      };
    }

    const parsed = Number(trimmedCustom);
    if (!Number.isSafeInteger(parsed)) {
      return {
        requestedCount: null,
        isCustomInput: true,
        eligibleCount: safeEligible,
        maxAllowed,
        isValid: false,
        errorCode: 'EXCEEDS_MAX_LIMIT',
        message:
          safeEligible > 0
            ? `Only ${safeEligible} ${poolLabel} ${safeEligible === 1 ? 'question is' : 'questions are'} available for your selection. Enter a number between 1 and ${maxAllowed}.`
            : `Maximum ${MAX_PRACTICE_QUESTIONS} questions allowed per practice session.`,
        plannedGeneratedCount: 0,
      };
    }

    if (parsed <= 0) {
      return {
        requestedCount: parsed,
        isCustomInput: true,
        eligibleCount: safeEligible,
        maxAllowed,
        isValid: false,
        errorCode: 'NON_POSITIVE',
        message: 'Question count must be at least 1.',
        plannedGeneratedCount: 0,
      };
    }

    requestedCount = parsed;
  } else {
    if (!Number.isInteger(presetCount) || presetCount <= 0) {
      return {
        requestedCount: presetCount,
        isCustomInput: false,
        eligibleCount: safeEligible,
        maxAllowed,
        isValid: false,
        errorCode: 'NON_POSITIVE',
        message: 'Question count must be at least 1.',
        plannedGeneratedCount: 0,
      };
    }
    requestedCount = presetCount;
  }

  // 2. Check topic selection & eligible question pool
  if (selectedTopicCount === 0) {
    return {
      requestedCount,
      isCustomInput,
      eligibleCount: 0,
      maxAllowed: 0,
      isValid: false,
      errorCode: 'NO_TOPICS_SELECTED',
      message: 'Please select at least one topic above to calculate eligible questions.',
      plannedGeneratedCount: 0,
    };
  }

  if (safeEligible === 0) {
    return {
      requestedCount,
      isCustomInput,
      eligibleCount: 0,
      maxAllowed: 0,
      isValid: false,
      errorCode: 'NO_ELIGIBLE_QUESTIONS',
      message: `No ${poolLabel} questions match the current filter criteria. Adjust topics, difficulty, or source.`,
      plannedGeneratedCount: 0,
    };
  }

  // 3. Enforce eligible pool ceiling and application session maximum
  if (requestedCount > safeEligible) {
    return {
      requestedCount,
      isCustomInput,
      eligibleCount: safeEligible,
      maxAllowed,
      isValid: false,
      errorCode: 'EXCEEDS_ELIGIBLE',
      message: `Only ${safeEligible} ${poolLabel} ${safeEligible === 1 ? 'question is' : 'questions are'} available for your selection. Reduce the question count to ${maxAllowed} or fewer.`,
      plannedGeneratedCount: 0,
    };
  }

  if (requestedCount > MAX_PRACTICE_QUESTIONS) {
    return {
      requestedCount,
      isCustomInput,
      eligibleCount: safeEligible,
      maxAllowed,
      isValid: false,
      errorCode: 'EXCEEDS_MAX_LIMIT',
      message: `Maximum ${MAX_PRACTICE_QUESTIONS} questions allowed per practice session. Reduce the question count to ${MAX_PRACTICE_QUESTIONS} or fewer.`,
      plannedGeneratedCount: 0,
    };
  }

  return {
    requestedCount,
    isCustomInput,
    eligibleCount: safeEligible,
    maxAllowed,
    isValid: true,
    errorCode: null,
    message: null,
    plannedGeneratedCount: requestedCount,
  };
}

const PRACTICE_PAPERS_STORAGE_PREFIX = 'mockai_practice_papers_v1_';
const MAX_PERSISTED_PRACTICE_PAPERS = 12;

export class TopicPracticeService {
  /**
   * Internal caches for question taxonomy indexing & catalog to ensure fast sub-millisecond filtering
   */
  private static indexedQuestionsCache: Map<string, CompetitiveQuestion[]> = new Map();
  private static provisionalQuestionsCache: Map<string, CompetitiveQuestion[]> = new Map();
  private static catalogCache: Map<string, ExamPracticeCatalog> = new Map();

  /**
   * Persist a generated synthetic practice paper to bounded user-scoped localStorage
   * so active practice sessions can always be resumed cleanly after a browser refresh.
   */
  static persistPracticePaper(paper: ExamPaper, userId: string = 'guest'): void {
    const effectiveUser = typeof userId === 'string' ? userId.trim() : '';
    if (!effectiveUser || typeof localStorage === 'undefined') return;
    try {
      const key = `${PRACTICE_PAPERS_STORAGE_PREFIX}${effectiveUser}`;
      const raw = localStorage.getItem(key);
      const existing: ExamPaper[] = raw ? JSON.parse(raw) : [];
      const updated = [paper, ...existing.filter((p) => p.id !== paper.id)].slice(
        0,
        MAX_PERSISTED_PRACTICE_PAPERS
      );
      localStorage.setItem(key, JSON.stringify(updated));
    } catch (err) {
      console.warn('Non-fatal: failed to persist synthetic practice paper:', err);
    }
  }

  /**
   * Restore a persisted synthetic practice paper strictly within `userId` scope.
   * Fails closed if `userId` is missing — NEVER scans other users' localStorage namespaces.
   */
  static getPersistedPracticePaper(paperId: string, userId?: string): ExamPaper | undefined {
    const effectiveUser = typeof userId === 'string' ? userId.trim() : '';
    if (
      typeof localStorage === 'undefined' ||
      !paperId.startsWith('practice_') ||
      !effectiveUser
    ) {
      return undefined;
    }
    try {
      const key = `${PRACTICE_PAPERS_STORAGE_PREFIX}${effectiveUser}`;
      const raw = localStorage.getItem(key);
      if (!raw) return undefined;
      const papers: ExamPaper[] = JSON.parse(raw);
      return Array.isArray(papers) ? papers.find((p) => p && p.id === paperId) : undefined;
    } catch (err) {
      console.warn('Non-fatal: failed to restore persisted practice paper:', err);
    }
    return undefined;
  }

  private static isQuestionScorable(q: CompetitiveQuestion): boolean {
    if (q.verificationStatus === 'FAILED' || q.verificationStatus === 'UNVERIFIED') {
      return false;
    }
    return Boolean(
      q.isMta ||
        (typeof q.correctAnswer === 'string' && q.correctAnswer.trim().length > 0) ||
        (Array.isArray(q.correctAnswerSet) && q.correctAnswerSet.length > 0) ||
        (q.correctAnswerIndex !== undefined && q.correctAnswerIndex >= 0) ||
        Boolean(q.answerRange) ||
        (Array.isArray(q.answerRanges) && q.answerRanges.length > 0)
    );
  }

  /**
   * Retrieve all strictly STAFF_VERIFIED / trusted OFFICIAL questions for an exam.
   * Strictly enforces getClassificationTrustLevel(meta) === 'STAFF_VERIFIED':
   * - RULE_BASED_PROVISIONAL is NEVER included in verified pools
   * - PENDING_REVIEW, REVIEW_REQUIRED, UNCLASSIFIED, and REJECTED are strictly excluded
   * - FAILED / UNVERIFIED questions and items without answer keys are excluded
   */
  static getEligibleVerifiedQuestions(examId: string): CompetitiveQuestion[] {
    const cached = this.indexedQuestionsCache.get(examId);
    if (cached) return cached;

    const papers = getPapersForExam(examId);
    const eligible: CompetitiveQuestion[] = [];
    const seenQuestionIds = new Set<string>();

    for (const paper of papers) {
      if (!paper.questions || !Array.isArray(paper.questions)) continue;

      for (const q of paper.questions) {
        if (!q.id || seenQuestionIds.has(q.id)) continue;
        if (!this.isQuestionScorable(q)) continue;

        const meta = getQuestionTopicMetadata(q, examId, q.sectionName || q.sectionId);
        const trust = getClassificationTrustLevel(meta);
        if (trust !== 'STAFF_VERIFIED') {
          continue;
        }

        seenQuestionIds.add(q.id);
        eligible.push({
          ...q,
          topic: meta.primaryTopicName || undefined,
          topicMetadata: meta,
          subtopic: meta.subtopicName || q.subtopic || undefined,
        });
      }
    }

    this.indexedQuestionsCache.set(examId, eligible);
    return eligible;
  }

  /**
   * Retrieve RULE_BASED_PROVISIONAL questions separately from STAFF_VERIFIED questions.
   * These are ONLY surfaced when the student explicitly opts into Provisional Practice,
   * and are never labeled or counted as Verified.
   */
  static getProvisionalQuestions(examId: string): CompetitiveQuestion[] {
    const cached = this.provisionalQuestionsCache.get(examId);
    if (cached) return cached;

    const papers = getPapersForExam(examId);
    const provisional: CompetitiveQuestion[] = [];
    const seenQuestionIds = new Set<string>();

    for (const paper of papers) {
      if (!paper.questions || !Array.isArray(paper.questions)) continue;

      for (const q of paper.questions) {
        if (!q.id || seenQuestionIds.has(q.id)) continue;
        if (!this.isQuestionScorable(q)) continue;

        const meta = getQuestionTopicMetadata(q, examId, q.sectionName || q.sectionId);
        const trust = getClassificationTrustLevel(meta);
        if (trust !== 'RULE_BASED_PROVISIONAL') {
          continue;
        }

        seenQuestionIds.add(q.id);
        provisional.push({
          ...q,
          topic: meta.primaryTopicName || undefined,
          topicMetadata: meta,
          subtopic: meta.subtopicName || q.subtopic || undefined,
        });
      }
    }

    this.provisionalQuestionsCache.set(examId, provisional);
    return provisional;
  }

  /**
   * Clear question index & catalog caches (useful after staff classification updates or hydration)
   */
  static clearIndexCache(): void {
    this.indexedQuestionsCache.clear();
    this.provisionalQuestionsCache.clear();
    this.catalogCache.clear();
  }

  /**
   * Build complete practice catalog for an exam with truthful 4-bucket trust counts:
   * Verified (STAFF/OFFICIAL) | Provisional (RULE_BASED) | Pending Review | Unclassified | Rejected
   */
  static getPracticeCatalog(examId: string): ExamPracticeCatalog {
    const cached = this.catalogCache.get(examId);
    if (cached) return cached;

    const examMeta = COMPETITIVE_EXAMS_CATALOG.find((e) => e.id === examId);
    const examName = examMeta?.name || examId.toUpperCase();
    const taxonomy = getExamTaxonomy(examId);
    const verifiedQuestions = this.getEligibleVerifiedQuestions(examId);
    const provisionalQuestions = this.getProvisionalQuestions(examId);

    // Compute exact exam-wide trust buckets across all unique questions in this exam
    const papers = getPapersForExam(examId);
    const seenIds = new Set<string>();
    const pendingQuestions: CompetitiveQuestion[] = [];
    const unclassifiedQuestions: CompetitiveQuestion[] = [];
    const rejectedQuestions: CompetitiveQuestion[] = [];

    for (const paper of papers) {
      if (!paper.questions || !Array.isArray(paper.questions)) continue;
      for (const q of paper.questions) {
        if (!q.id || seenIds.has(q.id)) continue;
        seenIds.add(q.id);
        const meta = getQuestionTopicMetadata(q, examId, q.sectionName || q.sectionId);
        const trust = getClassificationTrustLevel(meta);
        if (trust === 'PENDING_REVIEW') pendingQuestions.push({ ...q, topicMetadata: meta });
        else if (trust === 'UNCLASSIFIED') unclassifiedQuestions.push({ ...q, topicMetadata: meta });
        else if (trust === 'REJECTED') rejectedQuestions.push({ ...q, topicMetadata: meta });
      }
    }

    const matchesTopicDef = (q: CompetitiveQuestion, top: TopicDefinition): boolean => {
      const meta = q.topicMetadata;
      if (!meta) return false;
      if (meta.primaryTopicId === top.id) return true;
      if (meta.subtopicId === top.id) return true;
      if (top.subtopics?.some((s) => s.id === meta.subtopicId)) return true;
      return false;
    };

    const subjects: SubjectCatalogItem[] = [];

    if (taxonomy && taxonomy.subjects) {
      for (const subj of taxonomy.subjects) {
        if (subj.id === 'technical_core') continue;

        const topicItems: TopicCatalogItem[] = [];

        for (const top of subj.topics) {
          const matchingVerified = verifiedQuestions.filter((q) => matchesTopicDef(q, top));
          const matchingProvisional = provisionalQuestions.filter((q) => matchesTopicDef(q, top));
          const matchingPending = pendingQuestions.filter((q) => matchesTopicDef(q, top));
          const matchingUnclassified = unclassifiedQuestions.filter((q) => matchesTopicDef(q, top));
          const matchingRejected = rejectedQuestions.filter((q) => matchesTopicDef(q, top));

          const pyqCount = matchingVerified.filter((q) =>
            Boolean(q.year || q.paperCode || q.id.includes('gate-') || q.id.includes('chsl-'))
          ).length;
          const practiceCount = matchingVerified.length - pyqCount;

          topicItems.push({
            id: top.id,
            name: top.name,
            description: top.description,
            subtopics: top.subtopics?.map((s) => ({ id: s.id, name: s.name })),
            verifiedQuestionCount: matchingVerified.length,
            provisionalQuestionCount: matchingProvisional.length,
            pendingReviewCount: matchingPending.length,
            unclassifiedCount: matchingUnclassified.length,
            rejectedCount: matchingRejected.length,
            pyqCount,
            practiceCount,
          });
        }

        const totalSubjectVerified = topicItems.reduce((acc, t) => acc + t.verifiedQuestionCount, 0);
        const totalSubjectProvisional = topicItems.reduce((acc, t) => acc + t.provisionalQuestionCount, 0);
        const totalSubjectPending = topicItems.reduce((acc, t) => acc + t.pendingReviewCount, 0);
        const totalSubjectUnclassified = topicItems.reduce((acc, t) => acc + t.unclassifiedCount, 0);

        subjects.push({
          id: subj.id,
          name: subj.name,
          topics: topicItems,
          totalQuestions: totalSubjectVerified,
          provisionalQuestions: totalSubjectProvisional,
          pendingReviewQuestions: totalSubjectPending,
          unclassifiedQuestions: totalSubjectUnclassified,
        });
      }
    }

    const catalog: ExamPracticeCatalog = {
      examId,
      examName,
      subjects,
      totalVerifiedQuestions: verifiedQuestions.length,
      totalProvisionalQuestions: provisionalQuestions.length,
      totalPendingReviewQuestions: pendingQuestions.length,
      totalUnclassifiedQuestions: unclassifiedQuestions.length,
      totalRejectedQuestions: rejectedQuestions.length,
    };
    this.catalogCache.set(examId, catalog);
    return catalog;
  }

  /**
   * Returns the complete, uncapped pool of questions matching the selected topic/subtopic IDs,
   * difficulty, and source criteria.
   * Defaults strictly to STAFF_VERIFIED only (`includeProvisional = false`).
   */
  static getMatchingQuestionPool(
    examId: string,
    topicIds: string[],
    options: {
      difficulty?: 'easy' | 'medium' | 'hard' | 'mixed';
      source?: 'pyq' | 'practice' | 'both';
      includeProvisional?: boolean;
    } = {}
  ): CompetitiveQuestion[] {
    if (!topicIds || topicIds.length === 0) return [];

    const verifiedOnly = this.getEligibleVerifiedQuestions(examId);
    const allEligible = options.includeProvisional
      ? [...verifiedOnly, ...this.getProvisionalQuestions(examId)]
      : verifiedOnly;
    const targetTopics = new Set(topicIds.map((t) => t.toLowerCase()));

    // Expand selected parent topics to include their taxonomy subtopic IDs
    // so the matching pool aligns 100% with getPracticeCatalog counts.
    const taxonomy = getExamTaxonomy(examId);
    if (taxonomy && taxonomy.subjects) {
      for (const subj of taxonomy.subjects) {
        for (const top of subj.topics) {
          if (targetTopics.has(top.id.toLowerCase()) && top.subtopics) {
            for (const sub of top.subtopics) {
              targetTopics.add(sub.id.toLowerCase());
            }
          }
        }
      }
    }

    return allEligible.filter((q) => {
      const meta = q.topicMetadata;
      if (!meta) return false;

      const pId = meta.primaryTopicId?.toLowerCase();
      const sId = meta.subtopicId?.toLowerCase();

      // Check if primary topic or subtopic matches requested topics
      const matchesTopic =
        (pId && targetTopics.has(pId)) ||
        (sId && targetTopics.has(sId)) ||
        (q.subtopic && targetTopics.has(q.subtopic.toLowerCase()));

      if (!matchesTopic) return false;

      // Source filtering
      if (options.source === 'pyq') {
        const isPyq = Boolean(q.year || q.paperCode || q.id.includes('gate-') || q.id.includes('chsl-'));
        if (!isPyq) return false;
      } else if (options.source === 'practice') {
        const isPyq = Boolean(q.year || q.paperCode || q.id.includes('gate-') || q.id.includes('chsl-'));
        if (isPyq) return false;
      }

      // Difficulty filtering
      if (options.difficulty && options.difficulty !== 'mixed') {
        const marks = q.marks ?? 1;
        if (options.difficulty === 'easy' && marks > 1) return false;
        if (options.difficulty === 'hard' && marks < 2) return false;
      }

      return true;
    });
  }

  /**
   * Filter questions matching specific topic selection, difficulty, source, and optional count.
   * When `options.count` is omitted, returns the entire uncapped matching verified pool.
   */
  static filterQuestions(
    examId: string,
    topicIds: string[],
    options: {
      difficulty?: 'easy' | 'medium' | 'hard' | 'mixed';
      source?: 'pyq' | 'practice' | 'both';
      count?: number;
      includeProvisional?: boolean;
    } = {}
  ): CompetitiveQuestion[] {
    const filtered = this.getMatchingQuestionPool(examId, topicIds, {
      difficulty: options.difficulty,
      source: options.source,
      includeProvisional: options.includeProvisional,
    });

    // When no count is requested, return the complete uncapped eligible pool
    if (options.count === undefined) {
      return [...filtered];
    }

    // Reject non-positive or invalid count requests instead of silently defaulting to 10
    if (!Number.isInteger(options.count) || options.count <= 0) {
      return [];
    }

    if (filtered.length <= options.count) {
      return [...filtered];
    }

    // Unbiased Fisher-Yates shuffle to sample exactly options.count unique questions
    const shuffled = [...filtered];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, options.count);
  }

  /**
   * Generates a fully verified, registered ExamPaper for a Topic-wise Practice Test.
   * Directly integrates with the existing CompetitiveExamPlayerScreen.
   */
  static generatePracticeTest(config: PracticeTestConfig): ExamPaper {
    const {
      examId,
      subjectId,
      topicIds,
      questionCount,
      durationMinutes = 0,
      isUntimed = false,
      difficulty = 'mixed',
      source = 'both',
      includeProvisional = false,
    } = config;

    if (!topicIds || topicIds.length === 0) {
      throw new Error('Please select at least one topic to generate a practice test.');
    }

    if (!Number.isInteger(questionCount) || questionCount < 1) {
      throw new Error('Question count must be a whole number of at least 1.');
    }

    if (questionCount > MAX_PRACTICE_QUESTIONS) {
      throw new Error(
        `Question count cannot exceed the maximum of ${MAX_PRACTICE_QUESTIONS} questions per practice session.`
      );
    }

    const examMeta = COMPETITIVE_EXAMS_CATALOG.find((e) => e.id === examId);
    const examName = examMeta?.name || examId.toUpperCase();
    const taxonomy = getExamTaxonomy(examId);
    const subjectDef = taxonomy?.subjects.find((s) => s.id === subjectId);
    const subjectName = subjectDef?.name || subjectId;
    const poolLabel = includeProvisional ? 'eligible (including provisional)' : 'verified';

    // Evaluate the full uncapped matching pool before sampling
    const matchingPool = this.getMatchingQuestionPool(examId, topicIds, {
      difficulty,
      source,
      includeProvisional,
    });

    if (matchingPool.length === 0) {
      throw new Error(
        `No ${poolLabel} questions available for the selected topic(s) with the specified criteria (${difficulty}, ${source}).`
      );
    }

    if (questionCount > matchingPool.length) {
      throw new Error(
        `Only ${matchingPool.length} ${poolLabel} ${matchingPool.length === 1 ? 'question is' : 'questions are'} available for your selection, but ${questionCount} were requested. Reduce the question count to ${matchingPool.length} or fewer.`
      );
    }

    // Sample exactly `questionCount` unique questions
    const selectedQuestions = this.filterQuestions(examId, topicIds, {
      difficulty,
      source,
      count: questionCount,
      includeProvisional,
    });

    if (selectedQuestions.length !== questionCount) {
      throw new Error(
        `Unable to assemble ${questionCount} ${poolLabel} questions (found ${selectedQuestions.length}).`
      );
    }

    const containsProvisional = selectedQuestions.some(
      (q) => getClassificationTrustLevel(q.topicMetadata) === 'RULE_BASED_PROVISIONAL'
    );

    // Determine topic display titles
    const topicNames: string[] = [];
    if (subjectDef) {
      for (const tId of topicIds) {
        const foundTopic = subjectDef.topics.find((t) => t.id === tId);
        if (foundTopic) {
          topicNames.push(foundTopic.name);
        } else {
          // Check subtopics
          for (const top of subjectDef.topics) {
            const foundSub = top.subtopics?.find((s) => s.id === tId);
            if (foundSub) {
              topicNames.push(foundSub.name);
              break;
            }
          }
        }
      }
    }

    const titleTopicSnippet = topicNames.length > 0 ? topicNames.join(', ') : 'Topics';

    // Marking scheme inherits verified exam configuration
    const defaultScheme = examMeta?.defaultPattern.markingScheme || {
      marksPerCorrect: 1.0,
      negativeMarks: 0.33,
      unansweredMarks: 0.0,
    };

    // Calculate total marks from question pool
    const totalMarks = selectedQuestions.reduce((sum, q) => sum + (q.marks || defaultScheme.marksPerCorrect), 0);

    // Duration calculation: if timed, allow user override or allocate 3 minutes per question for GATE
    const effectiveDurationMinutes = isUntimed
      ? 0
      : durationMinutes > 0
      ? durationMinutes
      : Math.max(10, Math.ceil(selectedQuestions.length * (examId === 'gate' ? 3 : 1.5)));

    const paperId = `practice_${examId}_${subjectId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Re-index questions 1..N for display
    const renumberedQuestions: CompetitiveQuestion[] = selectedQuestions.map((q, idx) => ({
      ...q,
      questionNumber: idx + 1,
      sectionId: 'topic_practice_section',
      sectionName: subjectName,
    }));

    const paper: ExamPaper = {
      id: paperId,
      examId,
      examName,
      editionYear: new Date().getFullYear(),
      title: containsProvisional
        ? `${examName} Topic Practice (Provisional) — ${subjectName}`
        : `${examName} Topic Practice — ${subjectName}`,
      subTitle: `${titleTopicSnippet} • ${renumberedQuestions.length} Questions${containsProvisional ? ' • Provisional' : ''}`,
      date: new Date().toISOString().split('T')[0],
      shift: isUntimed
        ? containsProvisional
          ? 'Untimed Provisional Practice'
          : 'Untimed Practice'
        : containsProvisional
        ? 'Timed Provisional Practice'
        : 'Timed Practice',
      tier: containsProvisional ? 'Provisional Topic Practice' : 'Topic Practice',
      language: 'English',
      durationMinutes: effectiveDurationMinutes,
      totalMarks,
      totalQuestions: renumberedQuestions.length,
      isComplete: true,
      paperType: 'CBE_OBJECTIVE',
      markingScheme: {
        marksPerCorrect: defaultScheme.marksPerCorrect,
        negativeMarks: defaultScheme.negativeMarks,
        unansweredMarks: defaultScheme.unansweredMarks || 0,
      },
      sections: [
        {
          id: 'topic_practice_section',
          name: `${subjectName}: ${titleTopicSnippet.slice(0, 40)}${titleTopicSnippet.length > 40 ? '...' : ''}`,
          questionCount: renumberedQuestions.length,
          maxMarks: totalMarks,
          startIndex: 0,
          endIndex: renumberedQuestions.length - 1,
        },
      ],
      questions: renumberedQuestions,
      isUntimed,
      isTopicPractice: true,
      isProvisionalPractice: containsProvisional,
      testingMode: 'TOPIC_PRACTICE',
      selectedTopics: topicIds,
      selectedSubject: subjectId,
      publicationStatus: 'PUBLISHED',
      answerKeyStatus: 'AVAILABLE',
      answerKeyVersion: 'v1_official',
      scoringConfigVersion: 'v1_standard',
    };

    // Persist strictly within userId scope (never register globally in shared EXAM_PAPERS_MAP)
    const effectiveUserId = config.userId || 'guest';
    this.persistPracticePaper(paper, effectiveUserId);
    TopicPracticeCloudSync.savePracticePaperRemote(paper, effectiveUserId).catch(() => {
      // Offline/unmigrated cloud fallback is already queued inside TopicPracticeCloudSync
    });

    return paper;
  }

  /**
   * Convert remote Supabase `student_topic_practice_history` rows into normalized ExamTestSession objects
   * strictly belonging to `userId`.
   */
  private static remoteRowsToSessions(
    userId: string,
    remoteRows: RemotePracticeHistoryRow[]
  ): ExamTestSession[] {
    const converted: ExamTestSession[] = [];
    for (const row of remoteRows) {
      if (!row || row.user_id !== userId || !row.session_id) continue;
      const attemptedMs = row.attempted_at ? new Date(row.attempted_at).getTime() : Date.now();
      converted.push({
        sessionId: row.session_id,
        paperId: row.paper_id,
        examId: row.exam_id,
        paperTitle: `${row.exam_id.toUpperCase()} Topic Practice`,
        userId: row.user_id,
        status: 'COMPLETED',
        startedAt: attemptedMs,
        lastSavedAt: attemptedMs,
        completedAt: attemptedMs,
        expiresAt: attemptedMs,
        durationSeconds: row.time_spent_seconds || 0,
        timeRemainingSeconds: 0,
        elapsedSeconds: row.time_spent_seconds || 0,
        currentQuestionIndex: 0,
        currentSectionId: 'topic_practice_section',
        userAnswers: {},
        questionStatuses: {},
        version: 1,
        result: {
          sessionId: row.session_id,
          paperId: row.paper_id,
          examId: row.exam_id,
          paperTitle: `${row.exam_id.toUpperCase()} Topic Practice`,
          totalQuestions: row.question_count,
          attemptedCount: 0,
          correctCount: 0,
          wrongCount: 0,
          unansweredCount: 0,
          totalScore: Number(row.score ?? 0),
          maxMarks: Number(row.max_score ?? 0),
          percentage:
            Number(row.max_score ?? 0) > 0
              ? Math.round((Number(row.score ?? 0) / Number(row.max_score)) * 10000) / 100
              : 0,
          accuracy: Number(row.accuracy ?? 0),
          timeSpentSeconds: row.time_spent_seconds || 0,
          submittedAt: attemptedMs,
          sectionResults: {},
          topicResults: (row.topic_results || {}) as Record<string, TopicResultSummary>,
          difficultyResults: (row.difficulty_results || {}) as Record<string, DifficultyResultSummary>,
          isScoreCalculated: true,
        },
      });
    }
    return converted;
  }

  /**
   * Adaptive Performance Analytics:
   * Aggregates topic performance from local sessions plus optional remote cloud rows.
   * Strictly isolated per userId and deduplicated by sessionId (zero cross-user leakage or double-counting).
   */
  static getTopicPerformanceHistory(
    userId: string = 'guest',
    examId?: string,
    remoteRows: RemotePracticeHistoryRow[] = []
  ): TopicPerformanceStat[] {
    const localSessions = ExamSessionService.getLocalSessions(userId);
    // Only include legacy attempt history entries explicitly belonging to this userId
    const userHistorySessions = ExamService.getAttemptHistory().filter(
      (s) => (s.userId || 'guest') === userId
    );
    const remoteSessions = this.remoteRowsToSessions(userId, remoteRows);

    // Deduplicate by sessionId so a completed session present in local + cloud is counted exactly once
    const dedupedById = new Map<string, ExamTestSession>();
    for (const s of [...remoteSessions, ...localSessions, ...userHistorySessions]) {
      if (!s || !s.sessionId) continue;
      if ((s.userId || 'guest') !== userId) continue;
      const isCompleted = s.status === 'SUBMITTED' || s.status === 'COMPLETED';
      const matchesExam = !examId || s.examId === examId;
      if (!isCompleted || !matchesExam || !s.result) continue;

      const existing = dedupedById.get(s.sessionId);
      if (!existing || (s.completedAt || 0) >= (existing.completedAt || 0)) {
        dedupedById.set(s.sessionId, s);
      }
    }

    // Sort chronologically ascending so trend compares most recent attempt vs previous attempt accurately
    const allSessions = Array.from(dedupedById.values()).sort(
      (a, b) => (a.completedAt || a.startedAt || 0) - (b.completedAt || b.startedAt || 0)
    );

    const statsMap: Record<string, {
      topicId: string;
      topicName: string;
      attempts: number;
      totalQ: number;
      correct: number;
      wrong: number;
      unanswered: number;
      score: number;
      maxScore: number;
      lastDate: number;
      accuracies: number[];
    }> = {};

    for (const session of allSessions) {
      const res = session.result;
      if (!res) continue;

      const date = session.completedAt || session.lastSavedAt || session.startedAt || Date.now();

      // Check if session has topicResults
      if (res.topicResults && Object.keys(res.topicResults).length > 0) {
        for (const [topId, topRes] of Object.entries(res.topicResults)) {
          if (!statsMap[topId]) {
            statsMap[topId] = {
              topicId: topId,
              topicName: topRes.topicName || topId,
              attempts: 0,
              totalQ: 0,
              correct: 0,
              wrong: 0,
              unanswered: 0,
              score: 0,
              maxScore: 0,
              lastDate: date,
              accuracies: [],
            };
          }
          const s = statsMap[topId];
          s.attempts += 1;
          s.totalQ += topRes.totalQuestions;
          s.correct += topRes.correct;
          s.wrong += topRes.wrong;
          s.unanswered += topRes.skipped;
          s.score += topRes.score;
          s.maxScore += topRes.maxMarks;
          s.lastDate = Math.max(s.lastDate, date);
          s.accuracies.push(topRes.accuracy);
        }
      }
    }

    return Object.values(statsMap).map((item) => {
      const attempted = item.correct + item.wrong;
      const accuracy = attempted > 0 ? Math.round((item.correct / attempted) * 100) : 0;

      let trend: 'improving' | 'declining' | 'stable' = 'stable';
      if (item.accuracies.length >= 2) {
        const recent = item.accuracies[item.accuracies.length - 1];
        const prev = item.accuracies[item.accuracies.length - 2];
        if (recent > prev + 5) trend = 'improving';
        else if (recent < prev - 5) trend = 'declining';
      }

      // Topic is flagged weak if accuracy < 60% with at least 3 attempted questions, or wrong > correct
      const isWeak = attempted >= 3 && (accuracy < 60 || item.wrong > item.correct);

      return {
        topicId: item.topicId,
        topicName: item.topicName,
        totalAttempts: item.attempts,
        totalQuestionsAttempted: attempted,
        correct: item.correct,
        wrong: item.wrong,
        unanswered: item.unanswered,
        accuracy,
        scoreEarned: Math.round(item.score * 10) / 10,
        scoreMax: item.maxScore,
        lastAttemptedAt: item.lastDate,
        trend,
        isWeak,
      };
    }).sort((a, b) => a.accuracy - b.accuracy); // Lowest accuracy first
  }

  /**
   * Fetch remote cloud history from Supabase and merge with local sessions (deduplicated by sessionId).
   * Returns explicit cloud sync status so UI never falsely presents partial offline history as complete.
   */
  static async getTopicPerformanceHistoryMerged(
    userId: string = 'guest',
    examId?: string
  ): Promise<{
    stats: TopicPerformanceStat[];
    cloudSynced: boolean;
    cloudError: string | null;
  }> {
    const remote = await TopicPracticeCloudSync.fetchPracticeHistoryRemote(userId, examId);
    const stats = this.getTopicPerformanceHistory(userId, examId, remote.rows);
    return {
      stats,
      cloudSynced: remote.synced,
      cloudError: remote.error,
    };
  }

  /**
   * Generate actionable adaptive recommendations from a computed TopicPerformanceStat[] list.
   */
  static buildRecommendationsFromStats(
    stats: TopicPerformanceStat[],
    examId: string = 'gate'
  ): PracticeRecommendation[] {
    const weakTopics = stats.filter((s) => s.isWeak);
    const taxonomy = getExamTaxonomy(examId);
    const recommendations: PracticeRecommendation[] = [];

    for (const weak of weakTopics.slice(0, 3)) {
      let subjectId = 'technical_core';
      let subjectName = 'Core Subject';

      if (taxonomy) {
        for (const subj of taxonomy.subjects) {
          if (
            subj.topics.some(
              (t) => t.id === weak.topicId || t.subtopics?.some((s) => s.id === weak.topicId)
            )
          ) {
            subjectId = subj.id;
            subjectName = subj.name;
            break;
          }
        }
      }

      recommendations.push({
        topicId: weak.topicId,
        topicName: weak.topicName,
        subjectId,
        subjectName,
        accuracy: weak.accuracy,
        reason: `Current accuracy is ${weak.accuracy}% (${weak.wrong} incorrect across ${weak.totalQuestionsAttempted} questions).`,
        recommendedQuestionCount: 10,
      });
    }

    return recommendations;
  }

  /**
   * Generate actionable adaptive recommendations for the student based on actual weak topics.
   */
  static getRecommendations(userId: string = 'guest', examId: string = 'gate'): PracticeRecommendation[] {
    const stats = this.getTopicPerformanceHistory(userId, examId);
    return this.buildRecommendationsFromStats(stats, examId);
  }

  /**
   * Async merged recommendations combining local + cloud Supabase history.
   */
  static async getRecommendationsMerged(
    userId: string = 'guest',
    examId: string = 'gate'
  ): Promise<{
    recommendations: PracticeRecommendation[];
    stats: TopicPerformanceStat[];
    cloudSynced: boolean;
    cloudError: string | null;
  }> {
    const merged = await this.getTopicPerformanceHistoryMerged(userId, examId);
    return {
      recommendations: this.buildRecommendationsFromStats(merged.stats, examId),
      stats: merged.stats,
      cloudSynced: merged.cloudSynced,
      cloudError: merged.cloudError,
    };
  }
}
