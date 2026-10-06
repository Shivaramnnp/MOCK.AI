/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Contract: Canonical Question IR
 *
 * Represents the clean, verified pedagogical assessment unit.
 * Incorporates multi-layered QuestionIdentity, AssetGraph linkages,
 * and 9-metric ForensicConfidenceVector verification.
 */

import { CanonicalContentBlock, QuestionType } from '../../../types/canonicalQuestion';
import { SourceEvidence } from './evidence';
import { QuestionIdentity } from './identity';
import { ForensicConfidenceVector } from './certification';

export interface CanonicalOptionIR {
  key: string; // Preserves authentic key: 'A', 'B', '1', 'i', '(a)', etc.
  index: number; // 0-based sequence
  text: string;
  contentBlocks: CanonicalContentBlock[];
  imageUrl?: string | null;
  assetId?: string; // Reference to AssetGraphNode
  altText?: string;
  ocrText?: string;
}

export interface CanonicalAnswerIR {
  type: QuestionType;
  correctKeys?: string[]; // e.g. ['A'], or ['A', 'C'] for MSQ
  correctIndices?: number[];
  numericValue?: number; // for NAT
  numericRange?: { min: number; max: number }; // for NAT
  numericRanges?: { min: number; max: number }[]; // for NAT with alternatives
  mapping?: Record<string, string>; // for MATCHING
  isMta?: boolean; // Marks To All (invalidated officially)
  explanation?: string;
  provenance: string;
}

export interface CanonicalScoringIR {
  marks: number;
  negativeMarks: number;
  unansweredMarks?: number;
  isConfigured: boolean;
  scoringRuleName?: string;
}

export interface CanonicalVerificationIR {
  status: 'CERTIFIED' | 'REVIEW_REQUIRED' | 'FAILED' | 'UNVERIFIED';
  reasons: string[];
  confidenceScore: number; // 0.0 - 1.0 (mean or min score)
  confidenceVector?: ForensicConfidenceVector;
  invariantsPassed: string[];
  invariantsFailed: string[];
  fatalVetoTriggered?: boolean;
  certifiedAt?: number;
  certifiedBy?: string;
}

export interface CanonicalQuestionIR {
  id: string; // Deterministic canonical ID
  identity?: QuestionIdentity; // Full 5-layer deterministic identity
  sourceId: string;
  sourceQuestionNumber: number;
  officialQuestionId?: string;
  sectionKey: string;
  sectionName: string;
  questionType: QuestionType;

  stimulus?: {
    type: 'PASSAGE' | 'CASELET' | 'CODE_SNIPPET' | 'SHARED_DIAGRAM';
    contentBlocks: CanonicalContentBlock[];
  };

  prompt: {
    text: string;
    contentBlocks: CanonicalContentBlock[];
  };

  options: CanonicalOptionIR[];
  answer?: CanonicalAnswerIR;
  scoring: CanonicalScoringIR;
  evidenceChain: SourceEvidence[];
  associatedAssetIds?: string[]; // AssetGraphNode IDs linked to stem/options
  verification: CanonicalVerificationIR;

  topic?: string;
  subtopic?: string;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | 'COMPETITIVE';
  metadata?: Record<string, unknown>;
}
