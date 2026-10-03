import { InputSourceType } from './index';

export type QuestionType =
  | 'MCQ'
  | 'MSQ'
  | 'NAT'
  | 'TRUE_FALSE'
  | 'MATCHING'
  | 'ASSERTION_REASON'
  | 'DESCRIPTIVE'
  | 'SUBJECTIVE'
  | 'UNKNOWN';

export type VerificationStatus =
  | 'VERIFIED'
  | 'PARTIAL'
  | 'REVIEW_REQUIRED'
  | 'FAILED'
  | 'UNVERIFIED';

export type BlockConfidence = 'VERIFIED' | 'HIGH_CONFIDENCE' | 'NEEDS_REVIEW' | 'FAILED';

export type CanonicalContentBlockType =
  | 'text'
  | 'math'
  | 'inline_math'
  | 'equation'
  | 'matrix'
  | 'table'
  | 'image'
  | 'diagram'
  | 'graph'
  | 'chart'
  | 'code'
  | 'pseudocode'
  | 'list'
  | 'figure'
  | 'mixed'
  | 'relational_algebra';

export type TableAlignment = 'left' | 'center' | 'right';

export type DisplayMode =
  | 'TEXT_ONLY'
  | 'IMAGE_ONLY'
  | 'IMAGE_WITH_ACCESSIBILITY_TEXT'
  | 'TEXT_AND_IMAGE';

export type TopicClassificationStatus =
  | 'VERIFIED'
  | 'REVIEW_REQUIRED'
  | 'UNCLASSIFIED';

export type TopicClassificationSource =
  | 'OFFICIAL'
  | 'STAFF'
  | 'RULE_BASED'
  | 'AI_ASSISTED'
  | 'MANUAL';

export interface QuestionTopicMetadata {
  primaryTopicId: string | null;
  primaryTopicName: string | null;
  secondaryTopicIds: string[];
  secondaryTopicNames: string[];
  classificationStatus: TopicClassificationStatus;
  classificationSource: TopicClassificationSource;
  confidence: number | null;
}

export interface CanonicalContentBlock {
  blockId?: string;
  type: CanonicalContentBlockType;
  content?: string;
  latex?: string;
  language?: string; // e.g. 'python', 'c', 'sql'
  headers?: string[]; // for table
  alignments?: TableAlignment[]; // for table
  rows?: string[][]; // for table
  assetId?: string;
  assetUrl?: string;
  altText?: string;
  ocrText?: string;
  caption?: string;
  displayMode?: DisplayMode;
  confidence?: BlockConfidence;
  blocks?: CanonicalContentBlock[]; // nested blocks for 'mixed' or container
  metadata?: Record<string, unknown>;
}

export interface CanonicalOption {
  id: string; // e.g. 'A', 'B', 'C', 'D' or '0', '1', '2', '3'
  text: string;
  contentBlocks?: CanonicalContentBlock[];
  imageUrl?: string | null;
  displayMode?: DisplayMode;
  altText?: string;
  ocrText?: string;
  assetId?: string;
  isCorrect?: boolean;
}

export interface CanonicalAnswer {
  questionType: QuestionType;
  /** For MCQ: designated correct option ID (e.g. 'A', 'B', 'C', 'D') */
  correctOptionId?: string;
  /** For MCQ: alias for correctOptionId */
  correctAnswer?: string;
  /** For MCQ: 0-indexed position (0..n-1), or -1 if unassigned */
  correctOptionIndex?: number;
  /** For MSQ: list of correct option IDs (e.g. ['A', 'C']) */
  correctOptionIds?: string[];
  /** For MSQ: alias for correctOptionIds */
  correctAnswerSet?: string[];
  /** For MSQ: list of correct option indices (e.g. [0, 2]) */
  correctOptionIndices?: number[];
  /** For MSQ with multiple official acceptable combinations (e.g. [['A', 'C'], ['B', 'D']]) */
  correctOptionSets?: string[][];
  /** For NAT: single exact numeric value if fixed */
  natValue?: number;
  /** For NAT: alias for natValue */
  numericValue?: number;
  /** For NAT: acceptable inclusive range */
  natRange?: { min: number; max: number };
  /** For NAT: alias for natRange */
  numericRange?: { min: number; max: number };
  /** For NAT: alternative acceptable ranges */
  natRanges?: { min: number; max: number }[];
  /** For Descriptive: model solution text */
  modelSolution?: string;
  /** For Descriptive: grading rubrics */
  rubrics?: string[];
  /** Marks To All: question cancelled or invalidated officially */
  isMta?: boolean;
  /** For MATCHING questions: map of key -> value (e.g. { P: 'II', Q: 'III' }) */
  matchingMapping?: Record<string, string>;
  /** For TRUE_FALSE questions */
  booleanValue?: boolean;
  /** Explicit resolution state of answer: 'RESOLVED' if answer is known, 'UNRESOLVED' if paper has no key */
  answerStatus?: 'RESOLVED' | 'UNRESOLVED';
}

export interface CanonicalScoring {
  marks: number;
  negativeMarks: number;
  partialMarking?: boolean;
  scoringRule?: 'STANDARD' | 'GATE_MCQ_1' | 'GATE_MCQ_2' | 'GATE_MSQ' | 'GATE_NAT' | 'SSC' | string;
}

export interface CanonicalProvenance {
  sourceType: InputSourceType;
  sourceId?: string;
  sourceFile?: string;
  sourceUrl?: string;
  sourcePage?: number | null;
  sourceParagraph?: number | null;
  sourceTimestamp?: string | null; // e.g. '04:15' for YouTube/Audio
  sourceBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
    pageWidth?: number;
    pageHeight?: number;
  };
  sourceExactText?: string;
  extractionTimestamp?: number;
  extractorVersion?: string;
  jsonPointer?: string;
  metadata?: Record<string, unknown>;
}

export interface CanonicalAsset {
  assetId: string;
  assetType: 'image' | 'table' | 'diagram' | 'chart' | 'graph';
  assetUrl: string;
  mimeType?: string;
  width?: number;
  height?: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  hash?: string;
  ownership: 'question' | 'option_A' | 'option_B' | 'option_C' | 'option_D' | string;
  caption?: string;
}

export interface CanonicalConfidence {
  extraction: number; // 0.0 - 1.0 (faithfulness of text/tokens from source)
  structure: number; // 0.0 - 1.0 (syntactic soundness of options, tables, code)
  answer: number; // 0.0 - 1.0 (verifiability of answer key/range)
  asset: number; // 0.0 - 1.0 (integrity and crop accuracy of diagrams)
}

export interface CanonicalQuestion {
  questionId: string;
  sourceId: string;
  sourceType: InputSourceType;
  sourceVersion?: string;

  questionNumber: number;
  sectionId?: string;
  sectionName?: string;

  questionText: string;
  contentBlocks: CanonicalContentBlock[];

  questionType: QuestionType;
  options: CanonicalOption[];
  answer: CanonicalAnswer;

  scoring: CanonicalScoring;
  provenance: CanonicalProvenance;
  assets: CanonicalAsset[];

  sourceUrl?: string;
  citation?: {
    youtubeTimestamp?: string;
    sourceExactText?: string;
    [key: string]: unknown;
  };
  diagramUrl?: string | null;
  diagramUrls?: string[];

  explanation: string;
  topic?: string | QuestionTopicMetadata;
  topicMetadata?: QuestionTopicMetadata;
  subtopic?: string;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | 'COMPETITIVE';
  marks?: number;
  negativeMarks?: number;

  verificationStatus: VerificationStatus;
  verificationReasons: string[];
  confidence: CanonicalConfidence;

  createdAt: number;
  updatedAt: number;
}
