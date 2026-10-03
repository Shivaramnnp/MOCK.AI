import { InputSourceType, Question } from '../../../types';
import { CanonicalQuestion } from '../../../types/canonicalQuestion';
import { QualityGateEvaluation } from '../qualityGate';
import { IngestionError } from '../../../types/ingestionErrors';

export interface IngestionOptions {
  requestedCount?: number;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | 'COMPETITIVE';
  topicHint?: string;
  sourceTitle?: string;
  generateIfShort?: boolean;
  skipDeduplication?: boolean;
  targetExamType?: 'GATE' | 'SSC' | 'GENERAL';
  onProgress?: (progress: any) => void;
}

export interface IngestionResult {
  success: boolean;
  sourceType: InputSourceType;
  sourceTitle: string;
  questions: CanonicalQuestion[];
  legacyQuestions: Question[];
  qualityReport: {
    total: number;
    verified: number;
    partial: number;
    reviewRequired: number;
    failed: number;
    evaluations: QualityGateEvaluation[];
  };
  errors?: IngestionError[];
  warnings?: string[];
}

export interface SourceAdapter<TInput = any> {
  readonly sourceType: InputSourceType;
  validateInput(input: TInput): Promise<{ valid: boolean; error?: string }>;
  process(input: TInput, options?: IngestionOptions): Promise<IngestionResult>;
}
