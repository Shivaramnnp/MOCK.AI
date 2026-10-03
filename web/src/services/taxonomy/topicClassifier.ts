/**
 * Deterministic Topic Classifier & Progress Evaluation Engine
 *
 * Implements deterministic pattern and keyword-based topic classification
 * matching exam syllabi, handling primary and secondary topics, preserving
 * unclassified questions under 'Uncategorized', and calculating attempt progress
 * WITHOUT inspecting answer keys or calculating scores during active exams.
 */

import {
  QuestionTopicMetadata,
  TopicClassificationStatus,
  TopicClassificationSource,
} from '../../types';
import {
  getExamTaxonomy,
  findSubjectTaxonomy,
  SubjectTaxonomy,
  TopicDefinition,
} from './topicTaxonomy';

export interface TopicProgressSummary {
  topicId: string;
  topicName: string;
  totalQuestions: number;
  attemptedQuestions: number;
  unattemptedQuestions: number;
  reviewQuestions: number;
  questionIndices: number[]; // 0-based indices in paper questions array
  questionNumbers: number[]; // 1-based question numbers
  classificationStatus: TopicClassificationStatus;
}

export const UNCATEGORIZED_TOPIC_ID = 'uncategorized';
export const UNCATEGORIZED_TOPIC_NAME = 'Uncategorized';

export type QuestionInput = {
  id?: string;
  questionText?: string;
  sectionId?: string;
  sectionName?: string;
  topic?: string | QuestionTopicMetadata;
  topicMetadata?: QuestionTopicMetadata;
  contentBlocks?: any[];
  questionNumber?: number;
  [key: string]: any;
};

/**
 * Extracts plain text from a question (stem and content blocks).
 */
export function getQuestionSearchableText(question: QuestionInput): string {
  const parts: string[] = [];
  if (question.questionText) {
    parts.push(question.questionText);
  }

  if (question.contentBlocks && Array.isArray(question.contentBlocks)) {
    for (const block of question.contentBlocks) {
      if (block.content) parts.push(block.content);
      if (block.ocrText) parts.push(block.ocrText);
      if (block.altText) parts.push(block.altText);
    }
  }

  return parts.join(' ');
}

/**
 * Determines whether an existing object is already a QuestionTopicMetadata structure.
 */
function isTopicMetadataObject(obj: unknown): obj is QuestionTopicMetadata {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'primaryTopicId' in obj &&
    'classificationStatus' in obj
  );
}

/**
 * Resolves or classifies the topic metadata for a single question.
 * Strictly avoids inventing classifications when no high-confidence match is found.
 */
export function getQuestionTopicMetadata(
  question: QuestionInput,
  examId?: string,
  sectionIdentifier?: string
): QuestionTopicMetadata {
  // 1. Check existing topicMetadata on the question
  if (question.topicMetadata && isTopicMetadataObject(question.topicMetadata)) {
    return question.topicMetadata;
  }

  // 2. Check question.topic if it is already a structured metadata object
  if (isTopicMetadataObject(question.topic)) {
    return question.topic;
  }

  // 3. If question.topic is a string, check if it matches a known topic or label
  if (typeof question.topic === 'string' && question.topic.trim().length > 0) {
    const rawTopic = question.topic.trim();
    const id = rawTopic.toLowerCase().replace(/[^a-z0-9]/g, '_');
    return {
      primaryTopicId: id,
      primaryTopicName: rawTopic,
      secondaryTopicIds: [],
      secondaryTopicNames: [],
      classificationStatus: 'VERIFIED',
      classificationSource: 'RULE_BASED',
      confidence: 0.85,
    };
  }

  // 4. Deterministic syllabus matching
  const targetExamId = examId || question.examId || 'ssc-chsl';
  const examTaxonomy = getExamTaxonomy(targetExamId);

  const sectionName = sectionIdentifier || question.sectionName || question.sectionId || '';

  if (examTaxonomy && sectionName) {
    const subject = findSubjectTaxonomy(examTaxonomy, sectionName);
    if (subject) {
      const matchResult = matchQuestionToSubject(question, subject);
      if (matchResult) {
        return matchResult;
      }
    }
  }

  // 5. Fallback: Unclassified / Uncategorized
  return {
    primaryTopicId: UNCATEGORIZED_TOPIC_ID,
    primaryTopicName: UNCATEGORIZED_TOPIC_NAME,
    secondaryTopicIds: [],
    secondaryTopicNames: [],
    classificationStatus: 'UNCLASSIFIED',
    classificationSource: 'RULE_BASED',
    confidence: 0,
  };
}

/**
 * Matches question content against the topics of a specific subject.
 */
function matchQuestionToSubject(
  question: QuestionInput,
  subject: SubjectTaxonomy
): QuestionTopicMetadata | null {
  const text = getQuestionSearchableText(question);
  if (!text) return null;

  interface ScoredTopic {
    topic: TopicDefinition;
    score: number;
  }

  const scored: ScoredTopic[] = [];

  for (const topic of subject.topics) {
    let score = 0;

    // Check regex patterns (high precision)
    if (topic.patterns) {
      for (const pattern of topic.patterns) {
        if (pattern.test(text)) {
          score += 10;
        }
      }
    }

    // Check keywords (medium precision)
    if (topic.keywords) {
      for (const kw of topic.keywords) {
        const kwRegex = new RegExp(`\\b${escapeRegExp(kw)}\\b`, 'i');
        if (kwRegex.test(text)) {
          score += 3;
        }
      }
    }

    // Check subtopics
    if (topic.subtopics) {
      for (const sub of topic.subtopics) {
        if (sub.patterns) {
          for (const pattern of sub.patterns) {
            if (pattern.test(text)) score += 8;
          }
        }
        if (sub.keywords) {
          for (const kw of sub.keywords) {
            const kwRegex = new RegExp(`\\b${escapeRegExp(kw)}\\b`, 'i');
            if (kwRegex.test(text)) score += 3;
          }
        }
      }
    }

    if (score > 0) {
      scored.push({ topic, score });
    }
  }

  if (scored.length === 0) {
    return null;
  }

  // Sort descending by match score
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const secondaries = scored.slice(1).filter((s) => s.score >= 5);

  const confidence = Math.min(1.0, best.score / 15);

  return {
    primaryTopicId: best.topic.id,
    primaryTopicName: best.topic.name,
    secondaryTopicIds: secondaries.map((s) => s.topic.id),
    secondaryTopicNames: secondaries.map((s) => s.topic.name),
    classificationStatus: confidence >= 0.6 ? 'VERIFIED' : 'REVIEW_REQUIRED',
    classificationSource: 'RULE_BASED' as TopicClassificationSource,
    confidence: Number(confidence.toFixed(2)),
  };
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Calculates topic progress summaries for a given list of questions.
 *
 * IMPORTANT ACTIVE EXAM INVARIANT:
 * This function calculates candidate ATTEMPT / REVIEW progress ONLY.
 * It NEVER evaluates question correctness or accesses answer keys.
 */
export function calculateTopicProgress(
  questions: QuestionInput[],
  currentAnswers: Record<number, any>,
  bookmarks: Record<number, boolean>,
  examId?: string,
  filterSectionId?: string | null
): {
  topics: TopicProgressSummary[];
  allTotal: number;
  allAttempted: number;
  allUnattempted: number;
  allReview: number;
} {
  const topicMap: Record<string, TopicProgressSummary> = {};

  let allTotal = 0;
  let allAttempted = 0;
  let allUnattempted = 0;
  let allReview = 0;

  questions.forEach((q, idx) => {
    // If section filter is active, skip questions not in that section
    if (filterSectionId) {
      const qSection = q.sectionId || q.sectionName;
      if (qSection && qSection !== filterSectionId) {
        return;
      }
    }

    allTotal++;

    // Determine candidate attempt state
    const ans = currentAnswers[idx];
    const isAnswered =
      ans !== undefined &&
      ans !== null &&
      ans !== '' &&
      (Array.isArray(ans) ? ans.length > 0 : true);

    const isBookmarked = !!bookmarks[idx];

    if (isAnswered) {
      allAttempted++;
    } else {
      allUnattempted++;
    }

    if (isBookmarked) {
      allReview++;
    }

    // Resolve question topic metadata
    const meta = getQuestionTopicMetadata(q, examId, q.sectionName || q.sectionId);
    const topicId = meta.primaryTopicId || UNCATEGORIZED_TOPIC_ID;
    const topicName = meta.primaryTopicName || UNCATEGORIZED_TOPIC_NAME;

    if (!topicMap[topicId]) {
      topicMap[topicId] = {
        topicId,
        topicName,
        totalQuestions: 0,
        attemptedQuestions: 0,
        unattemptedQuestions: 0,
        reviewQuestions: 0,
        questionIndices: [],
        questionNumbers: [],
        classificationStatus: meta.classificationStatus,
      };
    }

    const summary = topicMap[topicId];
    summary.totalQuestions++;
    summary.questionIndices.push(idx);
    summary.questionNumbers.push(q.questionNumber || idx + 1);

    if (isAnswered) {
      summary.attemptedQuestions++;
    } else {
      summary.unattemptedQuestions++;
    }

    if (isBookmarked) {
      summary.reviewQuestions++;
    }
  });

  // Convert map to sorted array (Uncategorized placed last)
  const topics = Object.values(topicMap).sort((a, b) => {
    if (a.topicId === UNCATEGORIZED_TOPIC_ID) return 1;
    if (b.topicId === UNCATEGORIZED_TOPIC_ID) return -1;
    return b.totalQuestions - a.totalQuestions || a.topicName.localeCompare(b.topicName);
  });

  return {
    topics,
    allTotal,
    allAttempted,
    allUnattempted,
    allReview,
  };
}
