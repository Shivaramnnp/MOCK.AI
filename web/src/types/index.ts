export type VerificationStatus = 'VERIFIED' | 'PARTIAL' | 'UNVERIFIED' | 'FAILED';

export interface Citation {
  pageNumber?: number | null;
  youtubeTimestamp?: string | null;
  sourceExactText: string;
}

export interface Question {
  id?: string;
  questionText: string;
  options: string[]; // exactly 4 items always
  correctAnswerIndex: number; // 0-3, or -1 if not set
  topic?: string;
  explanation?: string;
  citation?: Citation;
  verificationStatus?: VerificationStatus;
  trustScore?: number;
  verifiedAt?: number;
}

export type InputSourceType =
  | 'PDF'
  | 'Docx'
  | 'WebUrl'
  | 'YouTube'
  | 'Topic'
  | 'Image'
  | 'Camera'
  | 'Audio'
  | 'Manual'
  | 'Json';

export type UserRole = 'TEACHER' | 'STUDENT' | 'LEARNER';

export interface UserProfile {
  uid: string;
  fullName: string;
  email: string;
  phoneNumber?: string;
  role: UserRole;
  createdAt: number;
}

export interface TestHistory {
  id: string;
  title: string;
  category: string;
  questions: Question[];
  createdAt: number;
  lastTakenAt: number | null;
  bestScore: number | null;
  bestScorePercent: number | null;
  bestTotal: number;
  lastTimeSpentSeconds?: number;
  wrongCount?: number;
  isBookmarked?: boolean;
}

export interface TestSessionState {
  testId: string;
  title: string;
  category: string;
  questions: Question[];
  currentIndex: number;
  userAnswers: Record<number, number>; // questionIndex -> optionIndex
  bookmarkedIndices: number[];
  isSubmitted: boolean;
  timeRemainingSeconds: number;
  elapsedSeconds: number;
  timerDurationSeconds: number;
  assignmentId?: string;
}

export interface ReviewItem {
  index: number;
  question: Question;
  userAnswerIndex: number | null;
  isCorrect: boolean;
}

export interface DailyInsight {
  title: string;
  summary: string;
  focusArea: string;
  dateStr: string;
}

export interface DailyTask {
  id: string;
  title: string;
  description: string;
  targetCount: number;
  completedCount: number;
  isDone: boolean;
  type: 'PRACTICE' | 'REVISION' | 'STREAK';
}

export interface StudyStreak {
  currentStreak: number;
  bestStreak: number;
  lastStudyDate: string; // YYYY-MM-DD
}

export interface ClassModel {
  classId: string;
  name: string;
  teacherId: string;
  teacherName: string;
  joinCode: string;
  studentIds: string[];
  studentNames: Record<string, string>;
  createdAt: number;
}

export interface SubmissionData {
  status: 'PENDING' | 'SUBMITTED';
  score?: number;
  total?: number;
  scorePercent?: number;
  submittedAt?: number;
}

export interface AssignmentModel {
  assignmentId: string;
  classId: string;
  className: string;
  testTitle: string;
  assignedBy: string;
  assignedByName: string;
  dueDate: number | null;
  assignedAt: number;
  questions: Question[];
  studentSubmissions: Record<string, SubmissionData>; // studentUid -> SubmissionData
}

export interface PublishedExam {
  id: string;
  title: string;
  subject: string;
  description: string;
  creatorId: string;
  creatorName: string;
  price: number; // 0 for free
  rating: number;
  totalSales: number;
  questions: Question[];
  publishedAt: number;
}

export type AppRoute =
  | 'home'
  | 'explore'
  | 'explore_exam'
  | 'exam_player'
  | 'exam_results'
  | 'exam_review'
  | 'processing'
  | 'editor'
  | 'test_player'
  | 'results'
  | 'review'
  | 'analytics'
  | 'classroom'
  | 'marketplace'
  | 'profile'
  | 'settings';

// ── Competitive Exams & PYP Architecture ──────────────────────────────────────────

export interface MarkingScheme {
  marksPerCorrect: number;
  negativeMarks: number;
  unansweredMarks?: number;
}

export interface ExamPattern {
  durationMinutes: number;
  totalQuestions: number;
  totalMarks: number;
  markingScheme: MarkingScheme;
  sections: string[];
}

export interface CompetitiveExam {
  id: string;
  name: string;
  fullName: string;
  organization: string;
  category: string;
  description: string;
  status: 'AVAILABLE' | 'COMING_SOON';
  availableYears: number[];
  paperCount: number;
  tier?: string;
  defaultPattern: ExamPattern;
  highlights?: string[];
}

export interface ExamSection {
  id: string;
  name: string;
  questionCount: number;
  maxMarks: number;
  startIndex: number;
  endIndex: number;
}

export interface ExamQuestionAsset {
  type: 'image' | 'table' | 'diagram';
  url: string;
  caption?: string;
  width?: number;
  height?: number;
}

export interface ExamQuestionOption {
  id: string; // 'A', 'B', 'C', 'D'
  text?: string;
  imageUrl?: string | null;
}

export interface CompetitiveQuestion {
  id: string;
  questionNumber: number;
  sectionId: string;
  sectionName: string;
  questionText: string;
  questionType?: 'MCQ' | 'MSQ' | 'NAT';
  options: string[]; // options list (empty for NAT)
  optionImages?: (string | null)[]; // optional image URLs for visual options
  richOptions?: ExamQuestionOption[];
  correctAnswer: string; // 'A' | 'B' | 'C' | 'D' or multiple like 'A;B' or numeric range representation
  correctAnswerIndex: number; // 0-3 for MCQ (-1 if NAT/MSQ)
  correctAnswerSet?: string[]; // for MSQ: e.g. ['A', 'C']
  correctAnswerSets?: string[][]; // for MSQ with OR alternatives: e.g. [['A', 'D'], ['C', 'D']]
  correctAnswerIndices?: number[]; // for MSQ: e.g. [0, 2]
  answerRange?: { min: number; max: number }; // for NAT: e.g. { min: 0.16, max: 0.17 }
  answerRanges?: { min: number; max: number }[]; // for NAT with OR alternatives
  isMta?: boolean; // Marks To All
  explanation: string;
  diagramUrl?: string | null;
  diagramUrls?: string[];
  questionAssets?: ExamQuestionAsset[];
  marks: number;
  negativeMarks: number;
  examId: string;
  year: number;
  date: string;
  shift: string;
  tier: string;
  language: string;
  paperCode?: string;
  discipline?: string;
  wordLimit?: string;
  modelSolution?: string;
  rubrics?: string[];
}

export interface ExamPaper {
  id: string;
  examId: string;
  examName: string;
  editionYear: number;
  title: string;
  subTitle: string;
  date: string;
  shift: string;
  tier: string;
  paperType?: 'CBE_OBJECTIVE' | 'DESCRIPTIVE';
  paperCode?: string;
  discipline?: string;
  language: string;
  durationMinutes: number;
  totalMarks: number;
  totalQuestions: number;
  isComplete?: boolean;
  markingScheme: MarkingScheme;
  sections: ExamSection[];
  questions: CompetitiveQuestion[];
}

export type QuestionAttemptStatus =
  | 'NOT_VISITED'
  | 'NOT_ANSWERED'
  | 'ANSWERED'
  | 'MARKED_FOR_REVIEW'
  | 'ANSWERED_AND_MARKED_FOR_REVIEW';

export interface SectionResultSummary {
  sectionId: string;
  sectionName: string;
  totalQuestions: number;
  maxMarks: number;
  attempted: number;
  correct: number;
  wrong: number;
  skipped: number;
  score: number;
  accuracy: number; // percentage
  timeSpentSeconds: number;
}

export interface ExamResultSummary {
  sessionId: string;
  paperId: string;
  examId: string;
  paperTitle: string;
  totalQuestions: number;
  maxMarks: number;
  totalScore: number;
  percentage: number;
  accuracy: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  timeSpentSeconds: number;
  submittedAt: number;
  sectionResults: Record<string, SectionResultSummary>;
}

export interface ExamTestSession {
  sessionId: string;
  paperId: string;
  examId: string;
  paperTitle: string;
  userId: string;
  startedAt: number;
  completedAt: number | null;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  durationSeconds: number;
  timeRemainingSeconds: number;
  elapsedSeconds: number;
  userAnswers: Record<number, number>; // questionIndex (0-99) -> optionIndex (0-3)
  userMsqAnswers?: Record<number, number[]>; // questionIndex -> list of selected option indices
  userNatAnswers?: Record<number, string>; // questionIndex -> entered numeric string value
  userDescriptiveAnswers?: Record<number, string>; // questionIndex -> written text for descriptive tests
  questionStatuses: Record<number, QuestionAttemptStatus>; // questionIndex -> QuestionAttemptStatus
  currentQuestionIndex: number;
  currentSectionId: string;
  result?: ExamResultSummary;
}

