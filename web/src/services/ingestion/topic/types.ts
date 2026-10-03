import { CanonicalQuestion, QuestionType } from '../../../types/canonicalQuestion';
import { QualityGateEvaluation } from '../qualityGate';

export type TopicDifficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'ADAPTIVE' | 'COMPETITIVE';
export type TopicQuestionType = 'MCQ' | 'MSQ' | 'NAT';

export interface TopicIngestionInput {
  topic: string;
  exam?: string; // e.g. 'gate', 'gate-cse', 'gate-da', 'ssc-chsl', 'general'
  subject?: string; // e.g. 'Engineering Mathematics', 'Computer Science'
  difficulty?: TopicDifficulty | string;
  questionCount?: number;
  questionTypes?: TopicQuestionType[];
  marks?: number;
  negativeMarks?: number;
  timeLimit?: number; // in minutes
}

export interface CanonicalTopic {
  rawInput: string;
  normalizedTopic: string;
  canonicalName: string;
  domain: string;
  matchedExamId?: string;
  matchedSection?: string;
  matchedSyllabusTopic?: string;
  subtopics: string[];
  isCustomTopic: boolean;
}

export interface QuestionSpec {
  slotIndex: number; // 1-indexed
  topic: string;
  subtopic: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  questionType: TopicQuestionType;
  marks: number;
  negativeMarks: number;
  learningObjective: string;
  cognitiveLevel: 'Remembering' | 'Understanding' | 'Applying' | 'Analyzing' | 'Evaluating';
}

export type FailureCategory =
  | 'SCHEMA'
  | 'OPTIONS'
  | 'ANSWER'
  | 'MATH'
  | 'DIFFICULTY'
  | 'TOPIC'
  | 'DUPLICATE';

export interface TopicValidationResult {
  valid: boolean;
  status: 'VERIFIED' | 'REVIEW_REQUIRED' | 'REJECTED';
  reasons: string[];
  failureCategory?: FailureCategory;
  confidence: number;
  details: {
    schemaValid: boolean;
    optionsValid: boolean;
    answerValid: boolean;
    mathValid: boolean;
    difficultyValid: boolean;
    topicValid: boolean;
    duplicateFree: boolean;
  };
}

export interface TopicBatchProgress {
  stage:
    | 'NORMALIZING'
    | 'GROUNDING'
    | 'SPECIFYING'
    | 'GENERATING'
    | 'VALIDATING'
    | 'DEDUPLICATING'
    | 'COMPLETED'
    | 'FAILED';
  currentBatch: number;
  totalBatches: number;
  completedQuestions: number;
  totalQuestions: number;
  verifiedCount: number;
  reviewRequiredCount: number;
  rejectedCount: number;
  attemptNumber: number;
  message?: string;
}

export interface TopicCoverageStats {
  [subtopic: string]: {
    targetCount: number;
    generatedCount: number;
    verifiedCount: number;
  };
}

export interface DifficultyDistributionStats {
  EASY: number;
  MEDIUM: number;
  HARD: number;
}

export interface TopicGenerationMetadata {
  latencyMs: number;
  batchCount: number;
  totalAttempts: number;
  failureRate: number; // 0.0 to 1.0
  duplicateRate: number; // 0.0 to 1.0
  validationRate: number; // 0.0 to 1.0
  cacheHit: boolean;
  timestamp: string;
  modelUsed?: string;
}

export interface TopicIngestionResult {
  success: boolean;
  sourceType: 'Topic';
  sourceTitle: string;
  canonicalTopic: CanonicalTopic;
  questions: CanonicalQuestion[];
  legacyQuestions: any[];
  topicCoverage: TopicCoverageStats;
  difficultyDistribution: DifficultyDistributionStats;
  qualityReport: {
    total: number;
    verified: number;
    partial: number;
    reviewRequired: number;
    failed: number;
    evaluations: QualityGateEvaluation[];
  };
  metadata: TopicGenerationMetadata;
  warnings?: string[];
}
