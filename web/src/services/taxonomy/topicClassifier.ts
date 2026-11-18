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
import { TopicClassificationStore } from './topicClassificationStore';

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
 * Extracts the effective non-empty question stem from questionText, stem, or prompt aliases.
 * Returns empty string if all stem sources are absent, empty, or whitespace-only.
 */
export function extractQuestionStem(question: QuestionInput): string {
  if (typeof question.questionText === 'string' && question.questionText.trim().length > 0) {
    return question.questionText.trim();
  }
  if (typeof question.stem === 'string' && question.stem.trim().length > 0) {
    return question.stem.trim();
  }
  if (typeof question.prompt === 'string' && question.prompt.trim().length > 0) {
    return question.prompt.trim();
  }
  return '';
}

/**
 * Extracts plain text from a question (stem, prompt, options, richOptions, content blocks, and diagram cues).
 */
export function getQuestionSearchableText(question: QuestionInput): string {
  // Guard: if the stem is empty or whitespace-only, options must not independently
  // construct searchable text for topic classification.
  const effectiveStem = extractQuestionStem(question);
  if (effectiveStem.length === 0) {
    return '';
  }

  const parts: string[] = [];
  if (typeof question.questionText === 'string' && question.questionText.trim().length > 0) {
    parts.push(question.questionText);
  }
  if (typeof question.stem === 'string' && question.stem.trim().length > 0) {
    parts.push(question.stem);
  }
  if (typeof question.prompt === 'string' && question.prompt.trim().length > 0) {
    parts.push(question.prompt);
  }

  // Include standard options
  if (question.options && Array.isArray(question.options)) {
    for (const opt of question.options) {
      if (typeof opt === 'string') {
        parts.push(opt);
      } else if (opt && typeof opt === 'object' && (opt as any).text) {
        parts.push((opt as any).text);
      }
    }
  }

  // Include richOptions
  if (question.richOptions && Array.isArray(question.richOptions)) {
    for (const ro of question.richOptions) {
      if (ro && typeof ro === 'object') {
        if (ro.text) parts.push(ro.text);
        if (ro.altText) parts.push(ro.altText);
        if (ro.ocrText) parts.push(ro.ocrText);
      }
    }
  }

  // Include content blocks (text, latex math, ocrText, altText, caption)
  if (question.contentBlocks && Array.isArray(question.contentBlocks)) {
    for (const block of question.contentBlocks) {
      if (block.content) parts.push(block.content);
      if (block.latex) parts.push(block.latex);
      if (block.ocrText) parts.push(block.ocrText);
      if (block.altText) parts.push(block.altText);
      if (block.caption) parts.push(block.caption);
    }
  }

  // Include diagram cues
  if (question.diagramUrl && typeof question.diagramUrl === 'string') {
    parts.push(question.diagramUrl);
  }

  return parts
    .join(' ')
    .replace(/<\/?(?:u|b|i|strong|em|code)(?:\s+[^>]*)?>/gi, ' ')
    .replace(/_+/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl')
    .trim();
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
  // 0. Empty or whitespace-only stem safety invariant:
  // If effective stem (from questionText, stem, or prompt) is empty or whitespace-only,
  // return canonical UNCLASSIFIED/UNCATEGORIZED with confidence 0.
  // Options must not independently trigger a topic classification.
  const effectiveStem = extractQuestionStem(question);
  if (effectiveStem.length === 0) {
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

  // 0b. Check persisted staff override first (authoritative staff decisions take precedence)
  if (question.id) {
    const staffOverride = TopicClassificationStore.getOverride(question.id);
    if (staffOverride) {
      return staffOverride;
    }
  }

  // 1. Check existing topicMetadata on the question (fail closed if status/source invalid)
  const VALID_STATUSES = new Set([
    'VERIFIED',
    'PENDING_REVIEW',
    'REVIEW_REQUIRED',
    'UNCLASSIFIED',
    'UNCATEGORIZED',
    'REJECTED',
  ]);
  const VALID_SOURCES = new Set(['OFFICIAL', 'STAFF', 'RULE_BASED', 'AI_ASSISTED', 'MANUAL']);

  if (question.topicMetadata && isTopicMetadataObject(question.topicMetadata)) {
    const statusValid = VALID_STATUSES.has(question.topicMetadata.classificationStatus);
    const sourceValid =
      typeof question.topicMetadata.classificationSource === 'string' &&
      VALID_SOURCES.has(question.topicMetadata.classificationSource);

    if (!statusValid || !sourceValid) {
      return {
        primaryTopicId: UNCATEGORIZED_TOPIC_ID,
        primaryTopicName: UNCATEGORIZED_TOPIC_NAME,
        secondaryTopicIds: [],
        secondaryTopicNames: [],
        classificationStatus: 'REVIEW_REQUIRED',
        classificationSource: 'RULE_BASED',
        confidence: 0,
      };
    }

    if (
      question.topicMetadata.primaryTopicId !== UNCATEGORIZED_TOPIC_ID ||
      question.topicMetadata.classificationStatus === 'REJECTED' ||
      question.topicMetadata.classificationStatus === 'PENDING_REVIEW' ||
      question.topicMetadata.classificationStatus === 'REVIEW_REQUIRED'
    ) {
      return question.topicMetadata;
    }
  }

  // 2. Check question.topic if it is already a structured metadata object (fail closed if invalid)
  if (
    isTopicMetadataObject(question.topic) &&
    question.topic.primaryTopicId !== UNCATEGORIZED_TOPIC_ID
  ) {
    if (
      !VALID_STATUSES.has(question.topic.classificationStatus) ||
      !VALID_SOURCES.has(question.topic.classificationSource)
    ) {
      return {
        primaryTopicId: UNCATEGORIZED_TOPIC_ID,
        primaryTopicName: UNCATEGORIZED_TOPIC_NAME,
        secondaryTopicIds: [],
        secondaryTopicNames: [],
        classificationStatus: 'REVIEW_REQUIRED',
        classificationSource: 'RULE_BASED',
        confidence: 0,
      };
    }
    return question.topic;
  }

  // 3. A bare string question.topic is NEVER proof of human verification.
  // Always route through REVIEW_REQUIRED (RULE_BASED) so canonical strings cannot masquerade as verified.
  if (
    typeof question.topic === 'string' &&
    question.topic.trim().length > 0 &&
    question.topic.trim().toLowerCase() !== UNCATEGORIZED_TOPIC_ID &&
    question.topic.trim().toLowerCase() !== UNCATEGORIZED_TOPIC_NAME.toLowerCase()
  ) {
    const rawTopic = question.topic.trim();
    const id = rawTopic.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const targetExam = examId || question.examId;
    const tax = targetExam ? getExamTaxonomy(targetExam) : null;
    let isCanonicalTopic = false;
    if (tax) {
      isCanonicalTopic = tax.subjects.some((subj) =>
        subj.topics.some(
          (t) =>
            t.id.toLowerCase() === id ||
            t.name.toLowerCase() === rawTopic.toLowerCase() ||
            t.subtopics?.some(
              (s) => s.id.toLowerCase() === id || s.name.toLowerCase() === rawTopic.toLowerCase()
            )
        )
      );
    }
    return {
      primaryTopicId: isCanonicalTopic ? id : UNCATEGORIZED_TOPIC_ID,
      primaryTopicName: isCanonicalTopic ? rawTopic : UNCATEGORIZED_TOPIC_NAME,
      secondaryTopicIds: [],
      secondaryTopicNames: [],
      classificationStatus: 'REVIEW_REQUIRED',
      classificationSource: 'RULE_BASED',
      confidence: isCanonicalTopic ? 0.65 : 0.4,
    };
  }

  // 4. Deterministic syllabus matching
  const targetExamId = examId || question.examId || 'ssc-chsl';
  const examTaxonomy = getExamTaxonomy(targetExamId);

  const sectionName = sectionIdentifier || question.sectionName || question.sectionId || '';

  if (examTaxonomy && sectionName) {
    const subject = findSubjectTaxonomy(examTaxonomy, sectionName);
    if (subject) {
      // For engineering exams (like GATE), core discipline sections also contain Engineering Mathematics questions.
      // Therefore, if the subject is not General Aptitude, also consider Engineering Mathematics topics.
      let candidateTopics = [...subject.topics];
      if (examTaxonomy.examId.toLowerCase() === 'gate' && subject.id !== 'general_aptitude') {
        const mathSubject = examTaxonomy.subjects.find((s) => s.id === 'engineering_mathematics');
        if (mathSubject && mathSubject.id !== subject.id) {
          candidateTopics = [...candidateTopics, ...mathSubject.topics];
        }
      }

      const matchResult = matchQuestionToTopics(question, candidateTopics, subject.id);
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
 * Matches question content against candidate topics using deterministic patterns and keywords.
 */
function matchQuestionToTopics(
  question: QuestionInput,
  topics: TopicDefinition[],
  subjectId?: string
): QuestionTopicMetadata | null {
  const text = getQuestionSearchableText(question);
  if (!text || text.trim().length === 0) return null;

  interface ScoredTopic {
    topic: TopicDefinition;
    score: number;
    bestSubtopic?: { id: string; name: string };
    matchEvidence: string[];
  }

  const scored: ScoredTopic[] = [];

  for (const topic of topics) {
    let score = 0;
    const evidence: string[] = [];
    let topSubtopic: { id: string; name: string; score: number } | null = null;

    // Check regex patterns (high precision)
    if (topic.patterns) {
      for (const pattern of topic.patterns) {
        if (pattern.test(text)) {
          score += 10;
          evidence.push(`pattern:${pattern.source.slice(0, 30)}`);
        }
      }
    }

    // Check keywords (medium precision)
    if (topic.keywords) {
      for (const kw of topic.keywords) {
        const kwRegex = new RegExp(`\\b${escapeRegExp(kw)}\\b`, 'i');
        if (kwRegex.test(text)) {
          score += 4;
          evidence.push(`kw:${kw}`);
        }
      }
    }

    // Check subtopics
    if (topic.subtopics) {
      for (const sub of topic.subtopics) {
        let subScore = 0;
        if (sub.patterns) {
          for (const pattern of sub.patterns) {
            if (pattern.test(text)) {
              score += 8;
              subScore += 8;
              evidence.push(`subpattern:${pattern.source.slice(0, 30)}`);
            }
          }
        }
        if (sub.keywords) {
          for (const kw of sub.keywords) {
            const kwRegex = new RegExp(`\\b${escapeRegExp(kw)}\\b`, 'i');
            if (kwRegex.test(text)) {
              score += 3;
              subScore += 3;
              evidence.push(`subkw:${kw}`);
            }
          }
        }
        if (subScore > 0 && (!topSubtopic || subScore > topSubtopic.score)) {
          topSubtopic = { id: sub.id, name: sub.name, score: subScore };
        }
      }
    }

    if (score >= 4) {
      scored.push({
        topic,
        score,
        bestSubtopic: topSubtopic ? { id: topSubtopic.id, name: topSubtopic.name } : undefined,
        matchEvidence: evidence,
      });
    }
  }

  if (scored.length === 0) {
    return null;
  }

  // Sort descending by match score
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  // Strictly require minimum score threshold of 5 (e.g. 1 pattern or 2+ keywords)
  // to avoid false classifications from an isolated weak keyword match.
  if (best.score < 5) {
    return null;
  }

  const secondaries = scored.slice(1).filter((s) => s.score >= 5 && s.topic.id !== best.topic.id);

  // Confidence calculation grounded in evidence weight
  const confidence = Math.min(
    0.98,
    Math.max(
      0.60,
      best.score >= 10
        ? 0.85 + Math.min(0.13, (best.score - 10) * 0.01)
        : 0.65 + (best.score - 5) * 0.03
    )
  );

  // Any close tie between top two distinct topics is ambiguous and must remain in staff review
  const isTieOrClose =
    secondaries.length > 0 && Math.abs(best.score - secondaries[0].score) <= 2;

  return {
    primaryTopicId: best.topic.id,
    primaryTopicName: best.topic.name,
    secondaryTopicIds: secondaries.map((s) => s.topic.id),
    secondaryTopicNames: secondaries.map((s) => s.topic.name),
    subtopicId: best.bestSubtopic?.id || null,
    subtopicName: best.bestSubtopic?.name || null,
    classificationStatus: isTieOrClose ? 'REVIEW_REQUIRED' : (confidence >= 0.75 ? 'VERIFIED' : 'REVIEW_REQUIRED'),
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
