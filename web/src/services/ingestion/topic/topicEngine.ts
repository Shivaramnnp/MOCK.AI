/**
 * Mock.AI Production Topic Ingestion Engine
 * Master orchestrator implementing:
 * TOPIC → SYLLABUS GROUNDING → QUESTION SPECIFICATION → GENERATION → VALIDATION → DEDUPLICATION → FINAL TEST
 */

import { toLegacyQuestion } from '../questionMigrator';
import {
  CanonicalTopic,
  DifficultyDistributionStats,
  TopicBatchProgress,
  TopicCoverageStats,
  TopicIngestionInput,
  TopicIngestionResult,
} from './types';
import { groundTopic } from './syllabusGrounder';
import { planQuestionSpecs } from './questionSpecPlanner';
import { executeQualityLoop } from './topicQualityLoop';

// Fast in-memory cache
const TOPIC_CACHE: Map<string, { result: TopicIngestionResult; cachedAt: number }> = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Computes deterministic cache key for a topic request.
 */
function computeCacheKey(input: TopicIngestionInput, canonicalTopic: CanonicalTopic): string {
  const parts = [
    canonicalTopic.canonicalName.toLowerCase(),
    canonicalTopic.matchedExamId || 'general',
    input.difficulty || 'MEDIUM',
    input.questionCount || 8,
    (input.questionTypes || ['MCQ']).sort().join(','),
  ];
  return parts.join('::');
}

export interface TopicEngineOptions {
  onProgress?: (progress: TopicBatchProgress) => void;
  skipCache?: boolean;
  batchSize?: number;
  mockAiGenerator?: any;
}

/**
 * Master entrypoint for generating a structured practice test from a topic name.
 */
export async function generateTopicExam(
  input: TopicIngestionInput,
  options: TopicEngineOptions = {}
): Promise<TopicIngestionResult> {
  const startTime = performance.now();

  // 1. Stage 1: Topic Normalization & Syllabus Grounding
  options.onProgress?.({
    stage: 'NORMALIZING',
    currentBatch: 0,
    totalBatches: 0,
    completedQuestions: 0,
    totalQuestions: input.questionCount || 8,
    verifiedCount: 0,
    reviewRequiredCount: 0,
    rejectedCount: 0,
    attemptNumber: 1,
    message: `Normalizing topic "${input.topic}"...`,
  });

  const canonicalTopic = groundTopic(input.topic, input.exam);

  options.onProgress?.({
    stage: 'GROUNDING',
    currentBatch: 0,
    totalBatches: 0,
    completedQuestions: 0,
    totalQuestions: input.questionCount || 8,
    verifiedCount: 0,
    reviewRequiredCount: 0,
    rejectedCount: 0,
    attemptNumber: 1,
    message: `Grounded to ${canonicalTopic.canonicalName} (${canonicalTopic.subtopics.length} syllabus subtopics)`,
  });

  // 2. Check Fast-Path Cache
  const cacheKey = computeCacheKey(input, canonicalTopic);
  if (!options.skipCache && TOPIC_CACHE.has(cacheKey)) {
    const entry = TOPIC_CACHE.get(cacheKey)!;
    if (Date.now() - entry.cachedAt < CACHE_TTL_MS) {
      const cached = entry.result;
      return {
        ...cached,
        metadata: {
          ...cached.metadata,
          cacheHit: true,
          latencyMs: Math.round(performance.now() - startTime),
        },
      };
    }
  }

  // 3. Stage 2: Question Specification Planning (QuestionSpec[])
  options.onProgress?.({
    stage: 'SPECIFYING',
    currentBatch: 0,
    totalBatches: 0,
    completedQuestions: 0,
    totalQuestions: input.questionCount || 8,
    verifiedCount: 0,
    reviewRequiredCount: 0,
    rejectedCount: 0,
    attemptNumber: 1,
    message: `Planning blueprint for ${input.questionCount || 8} questions across syllabus subtopics...`,
  });

  const specs = planQuestionSpecs({
    canonicalTopic,
    questionCount: input.questionCount,
    difficulty: input.difficulty,
    questionTypes: input.questionTypes,
    marks: input.marks,
    negativeMarks: input.negativeMarks,
  });

  // 4. Stage 3 & 4: Controlled Batch Generation & Quality Loop
  const qualityLoopRes = await executeQualityLoop({
    specs,
    batchSize: options.batchSize || (specs.length <= 10 ? 5 : 8),
    onProgress: options.onProgress,
    mockAiGenerator: options.mockAiGenerator,
  });

  const questions = qualityLoopRes.questions;
  const latencyMs = Math.round(performance.now() - startTime);

  // 5. Calculate Topic Coverage Statistics
  const topicCoverage: TopicCoverageStats = {};
  for (const sub of canonicalTopic.subtopics) {
    topicCoverage[sub] = { targetCount: 0, generatedCount: 0, verifiedCount: 0 };
  }
  for (const spec of specs) {
    if (!topicCoverage[spec.subtopic]) {
      topicCoverage[spec.subtopic] = { targetCount: 0, generatedCount: 0, verifiedCount: 0 };
    }
    topicCoverage[spec.subtopic].targetCount++;
  }
  for (const q of questions) {
    const sub = q.subtopic || canonicalTopic.subtopics[0];
    if (!topicCoverage[sub]) {
      topicCoverage[sub] = { targetCount: 0, generatedCount: 0, verifiedCount: 0 };
    }
    topicCoverage[sub].generatedCount++;
    if (q.verificationStatus === 'VERIFIED') {
      topicCoverage[sub].verifiedCount++;
    }
  }

  // 6. Calculate Difficulty Distribution
  const difficultyDistribution: DifficultyDistributionStats = { EASY: 0, MEDIUM: 0, HARD: 0 };
  for (const q of questions) {
    const diff = (q.difficulty || 'MEDIUM').toUpperCase();
    if (diff === 'EASY') difficultyDistribution.EASY++;
    else if (diff === 'HARD') difficultyDistribution.HARD++;
    else difficultyDistribution.MEDIUM++;
  }

  // 7. Calculate Validation & Reliability Rates
  const totalGenerations = questions.length + qualityLoopRes.failureCount;
  const failureRate = totalGenerations === 0 ? 0 : qualityLoopRes.failureCount / totalGenerations;
  const duplicateRate = totalGenerations === 0 ? 0 : qualityLoopRes.duplicateCount / totalGenerations;
  const validationRate = questions.length === 0 ? 0 : qualityLoopRes.verifiedCount / questions.length;

  const legacyQuestions = questions.map(toLegacyQuestion);

  const result: TopicIngestionResult = {
    success: questions.length > 0,
    sourceType: 'Topic',
    sourceTitle: `${canonicalTopic.canonicalName} Practice Test`,
    canonicalTopic,
    questions,
    legacyQuestions,
    topicCoverage,
    difficultyDistribution,
    qualityReport: {
      total: questions.length,
      verified: qualityLoopRes.verifiedCount,
      partial: 0,
      reviewRequired: qualityLoopRes.reviewRequiredCount,
      failed: 0,
      evaluations: qualityLoopRes.evaluations as any[],
    },
    metadata: {
      latencyMs,
      batchCount: Math.ceil(specs.length / (options.batchSize || 8)),
      totalAttempts: qualityLoopRes.totalAttempts,
      failureRate: Math.round(failureRate * 1000) / 1000,
      duplicateRate: Math.round(duplicateRate * 1000) / 1000,
      validationRate: Math.round(validationRate * 1000) / 1000,
      cacheHit: false,
      timestamp: new Date().toISOString(),
    },
  };

  // Cache result
  TOPIC_CACHE.set(cacheKey, { result, cachedAt: Date.now() });

  return result;
}

/**
 * Clears topic cache (useful for testing and memory release).
 */
export function clearTopicCache(): void {
  TOPIC_CACHE.clear();
}
