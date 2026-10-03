/**
 * Versioned JSON Question Import & Export Engine Types
 * Mock.AI Production Ingestion Engine - Prompt 10/10
 *
 * Implements schema versioning (mockai.question-set/v1), strict validation,
 * chunked/streaming batch import, deduplication strategies, and round-trip models.
 */

import {
  CanonicalQuestion,
  CanonicalContentBlock,
  CanonicalOption,
  CanonicalAnswer,
  CanonicalScoring,
  CanonicalProvenance,
  CanonicalAsset,
  QuestionType,
  VerificationStatus,
  QuestionTopicMetadata,
} from '../../../types/canonicalQuestion';

export const CURRENT_SCHEMA_VERSION = 'mockai.question-set/v1';

export type SupportedSchemaVersion =
  | 'mockai.question-set/v1'
  | 'mockai.question-set/v2-preview'
  | 'legacy.mockai/v0';

export type DuplicateHandlingMode = 'CREATE_ONLY' | 'UPSERT' | 'REJECT_DUPLICATES';

export type AssetValidationMode = 'STRICT' | 'ALLOW_MISSING_AS_UNVERIFIED';

export interface JsonValidationError {
  recordIndex: number;
  questionId?: string;
  field: string;
  code: string;
  message: string;
  severity: 'FATAL' | 'WARNING';
}

export interface QuestionSetMetadata {
  title: string;
  examCode?: string;
  year?: number | string;
  subject?: string;
  section?: string;
  category?: string;
  totalQuestions?: number;
  exportedAt?: number | string;
  exportedBy?: string;
  source?: string;
  sourceFile?: string;
  sourceUrl?: string;
  sourceHash?: string;
  license?: string;
  [key: string]: unknown;
}

/**
 * Standard Canonical Question Record as serialized in mockai.question-set/v1
 */
export interface VersionedQuestionV1 {
  questionId: string;
  questionNumber: number;
  questionText: string;
  questionType: QuestionType;
  contentBlocks?: CanonicalContentBlock[];
  options?: CanonicalOption[];
  answer: CanonicalAnswer;
  scoring: CanonicalScoring;
  sectionId?: string;
  sectionName?: string;
  subject?: string;
  topic?: string | QuestionTopicMetadata;
  topicMetadata?: QuestionTopicMetadata;
  subtopic?: string;
  assets?: CanonicalAsset[];
  diagramUrl?: string | null;
  provenance?: CanonicalProvenance;
  explanation?: string;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | 'COMPETITIVE';
  verificationStatus?: VerificationStatus;
  verificationReasons?: string[];
  metadata?: Record<string, unknown>;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Canonical Versioned Document Envelope
 */
export interface JsonQuestionSetDocument {
  $schema: SupportedSchemaVersion | string;
  version: string;
  metadata: QuestionSetMetadata;
  questions: VersionedQuestionV1[];
}

/**
 * Streaming / Batch Import Progress Callback
 */
export interface ImportChunkProgress {
  totalRecords: number;
  processedRecords: number;
  currentBatch: number;
  totalBatches: number;
  percent: number;
}

/**
 * Comprehensive Import Execution Report
 */
export interface JsonImportReport {
  totalRecords: number;
  valid: number;
  invalid: number;
  duplicates: number;
  assetsMissing: number;
  warnings: number;
  imported: number;
  skipped: number;
  failed: number;
  durationMs: number;
  sourceHash: string;
  detectedSchema: string;
  errors: JsonValidationError[];
  questions: CanonicalQuestion[];
}

/**
 * Import Configuration Options
 */
export interface JsonImportOptions {
  batchSize?: number;
  duplicateMode?: DuplicateHandlingMode;
  assetMode?: AssetValidationMode;
  availableAssetIds?: Set<string>;
  knownQuestionIds?: Set<string>;
  onProgress?: (progress: ImportChunkProgress) => void;
  allowLegacyMigration?: boolean;
}
