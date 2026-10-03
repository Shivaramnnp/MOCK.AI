/**
 * Manual Question Authoring & Editor Type Definitions
 * Mock.AI Production Ingestion Engine - Prompt 9/10
 */

import {
  CanonicalContentBlock,
  CanonicalOption,
  CanonicalQuestion,
  CanonicalScoring,
  QuestionType,
} from '../../../types/canonicalQuestion';

export interface ManualFieldErrors {
  questionText?: string;
  options?: string;
  answer?: string;
  scoring?: string;
  contentBlocks?: string;
  section?: string;
  topic?: string;
  [key: string]: string | undefined;
}

export interface ManualValidationResult {
  isValid: boolean;
  fieldErrors: ManualFieldErrors;
  warnings: string[];
}

export interface ManualEditorState {
  testId: string;
  title: string;
  category: string;
  sectionName: string;
  subject: string;
  isDraft: boolean;
  questions: CanonicalQuestion[];
  activeQuestionIndex: number;
  isDirty: boolean;
  lastSavedAt: number | null;
}

export interface AutosavePayload {
  testId: string;
  title: string;
  category: string;
  isDraft: boolean;
  questions: CanonicalQuestion[];
  updatedAt: number;
}
