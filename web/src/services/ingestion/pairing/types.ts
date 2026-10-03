import { QuestionType, CanonicalQuestion } from '../../../types/canonicalQuestion';

export type ExamSourceRole = 'QUESTION_PAPER' | 'ANSWER_KEY' | 'SYLLABUS' | 'OTHER';

export interface ExamSource {
  id: string;
  examId?: string;
  paperId?: string;
  sourceRole: ExamSourceRole;
  fileName: string;
  fileHash: string;
  storagePath: string;
  sourceVersion: string;
  uploadedAt: number;
  pageCount: number;
  metadata?: Record<string, unknown>;
  paperIdentity?: PaperIdentity;
}

export interface PaperIdentity {
  exam?: string; // e.g. 'GATE', 'SSC'
  year?: number; // e.g. 2024, 2025
  paperCode?: string; // e.g. 'DA', 'CS', 'ME', 'CE'
  subject?: string; // e.g. 'Data Science & Artificial Intelligence'
  session?: string; // e.g. 'Shift 1', 'Session 2'
  shift?: string;
  tier?: string;
  setOrBooklet?: string;
  rawHeader?: string;
  confidence: number;
}

export interface RawAnswerEntry {
  questionNumber: number;
  sectionName?: string;
  rawAnswerText: string;
  pageNumber?: number;
  detectedType?: QuestionType;
  mcqOption?: string; // e.g. 'A'
  msqOptions?: string[]; // e.g. ['A', 'C', 'D']
  natRange?: { min: number; max: number };
  natValue?: number;
  isMta?: boolean; // Marks to All
  marks?: number;
  negativeMarks?: number;
  rawLine?: string;
}

export type MatchStatus =
  | 'MATCHED'
  | 'PARTIAL_MATCH'
  | 'REVIEW_REQUIRED'
  | 'MISMATCH'
  | 'MISSING_KEY'
  | 'DUPLICATE_KEY'
  | 'INVALID_KEY'
  | 'QUESTION_PAPER_ONLY'
  | 'ANSWER_KEY_ONLY'
  | 'SOURCE_MISMATCH';

export interface QuestionAnswerMatch {
  questionNumber: number;
  sectionName?: string;
  matchStatus: MatchStatus;
  matchConfidence: number; // 0.0 - 1.0 based on measurable evidence
  matchReason: string;
  sourceQuestionId?: string;
  sourceAnswerKeyId?: string;
  questionStemPreview?: string;
  questionType: QuestionType;
  answerKeyEntry?: RawAnswerEntry;
  canonicalQuestion?: CanonicalQuestion;
  issues: string[];
}

export interface PairingIngestionReport {
  success: boolean;
  isStandalone: boolean;
  mode: 'PAIRED' | 'QUESTION_PAPER_ONLY' | 'ANSWER_KEY_ONLY';
  questionPaperSummary?: {
    fileName: string;
    fileHash: string;
    pages: number;
    questionsDetected: number;
    detectedIdentity?: PaperIdentity;
  };
  answerKeySummary?: {
    fileName: string;
    fileHash: string;
    pages: number;
    keysDetected: number;
    detectedIdentity?: PaperIdentity;
  };
  identityMatched: boolean;
  identityMismatchReason?: string;
  matchedCount: number;
  missingQuestionsCount: number;
  missingKeysCount: number;
  duplicateQuestionsCount: number;
  duplicateKeysCount: number;
  typeConflictsCount: number;
  sourceConflictsCount: number;
  reviewRequiredCount: number;
  verifiedCount: number;
  unverifiedCount: number;
  failedCount: number;
  matches: QuestionAnswerMatch[];
  canonicalQuestions: CanonicalQuestion[];
  warnings: string[];
  errors: string[];
}

export interface PairingOptions {
  examHint?: string;
  yearHint?: number;
  paperCodeHint?: string;
  skipDeduplication?: boolean;
  userId?: string;
  onProgress?: (progress: { stage: string; percent: number; message: string; details?: any }) => void;
}
