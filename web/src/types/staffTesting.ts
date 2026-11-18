/**
 * MOCK.AI — Staff Paper Testing Centre Contracts & Types
 * Stage 1: Staff Testing, Anomaly Logging, and Defect Reporting
 */

export type StaffQuestionVerdict = 'PASS' | 'WRONG' | 'NEEDS_REVIEW';

export type StaffDefectCategory =
  | 'INCORRECT_OR_INCOMPLETE_QUESTION'
  | 'MISSING_OR_INCORRECT_OPTION'
  | 'INCORRECT_ANSWER_KEY'
  | 'INCORRECT_EXPLANATION'
  | 'MATHEMATICAL_OR_FORMULA_ERROR'
  | 'CORRUPTED_LANGUAGE_OR_TEXT'
  | 'MISSING_OR_INCORRECT_IMAGE_DIAGRAM'
  | 'DUPLICATE_QUESTION'
  | 'SOURCE_MISMATCH'
  | 'RENDERING_OR_NAVIGATION_PROBLEM'
  | 'OTHER';

export const STAFF_DEFECT_CATEGORY_LABELS: Record<StaffDefectCategory, string> = {
  INCORRECT_OR_INCOMPLETE_QUESTION: 'Incorrect or incomplete question',
  MISSING_OR_INCORRECT_OPTION: 'Missing or incorrect option',
  INCORRECT_ANSWER_KEY: 'Incorrect answer key',
  INCORRECT_EXPLANATION: 'Incorrect explanation',
  MATHEMATICAL_OR_FORMULA_ERROR: 'Mathematical or formula error',
  CORRUPTED_LANGUAGE_OR_TEXT: 'Corrupted language or text',
  MISSING_OR_INCORRECT_IMAGE_DIAGRAM: 'Missing or incorrect image/diagram',
  DUPLICATE_QUESTION: 'Duplicate question',
  SOURCE_MISMATCH: 'Source mismatch',
  RENDERING_OR_NAVIGATION_PROBLEM: 'Rendering/navigation problem',
  OTHER: 'Other',
};

export type StaffDefectStatus =
  | 'reported'
  | 'queued_for_repair'
  | 'repair_in_progress'
  | 'fix_prepared'
  | 'validation_failed'
  | 'ready_for_staff_review'
  | 'approved'
  | 'rejected'
  | 'repair_blocked';

export interface StaffQuestionDefect {
  defectId: string;
  paperId: string;
  questionId: string;
  questionNumber: number;
  reportingStaffId: string;
  reportingStaffEmail?: string;
  defectCategory: StaffDefectCategory;
  defectDescription: string;
  evidenceReference?: string;
  staffNotes?: string;
  questionSnapshot: any;
  questionFingerprint: string;
  status: StaffDefectStatus;
  repairHistory?: Array<{
    timestamp: string;
    action: string;
    staffId: string;
    notes?: string;
  }>;
  storageBackend?: 'remote_db' | 'local_only';
  isPendingSync?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StaffQuestionReview {
  verdict: StaffQuestionVerdict;
  notes?: string;
  defectId?: string;
  reviewedBy: string;
  reviewedAt: string;
}

export type StaffPaperTestingStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'HAS_DEFECTS';

export interface StaffPaperTestingSession {
  sessionId: string;
  paperId: string;
  paperName: string;
  examId: string;
  staffId: string;
  currentQuestionIndex: number;
  testedQuestionIds: string[];
  questionReviews: Record<string, StaffQuestionReview>;
  totalQuestions: number;
  testedCount: number;
  defectsCount: number;
  status: StaffPaperTestingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StaffPaperTestingSummary {
  paperId: string;
  paperName: string;
  examId: string;
  examName: string;
  totalQuestions: number;
  testedQuestions: number;
  reportedDefects: number;
  unresolvedDefects: number;
  status: StaffPaperTestingStatus;
  lastTestedAt?: string;
}

export interface ReportDefectParams {
  paperId: string;
  questionId: string;
  questionNumber: number;
  staffId: string;
  staffEmail?: string;
  defectCategory: StaffDefectCategory;
  defectDescription: string;
  evidenceReference?: string;
  staffNotes?: string;
  questionSnapshot: any;
}
