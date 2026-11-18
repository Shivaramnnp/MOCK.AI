/**
 * UADUE Phase 3 — Delivery Foundation Type Definitions
 * Specification: UADUE-P3-HARD-R3-001 (R3 Final Hardened Contract)
 */

import {
  AnswerAuthorityResolutionVersion,
  AnswerCandidate,
  ScoringPolicyVersion,
  ScoringDisposition,
} from '../canonical/types';
import { QuestionScoringTraits } from '../canonical/scoringEvaluator';

export type ExamSessionState =
  | 'INITIALIZED'
  | 'ACTIVE'
  | 'PAUSED'
  | 'RECOVERY_PENDING'
  | 'SUBMITTED'
  | 'EXPIRED'
  | 'TERMINATED';

export class CandidateApiError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`Candidate API Error [${code}]: ${message}`);
    this.name = 'CandidateApiError';
  }
}

export interface ExamSessionRecord {
  examSessionId: string;
  tenantId: string;
  candidateId: string;
  packageId: string;
  packageIntegritySeal: string;
  sessionConfiguration: Record<string, unknown>;
  sessionState: ExamSessionState;
  stateVersion: number;
  currentLeaseId: string;
  leaseHeartbeatAt: string;
  scheduledStartAt: string;
  actualStartedAt: string | null;
  durationSeconds: number;
  accumulatedPauseSeconds: number;
  pauseCount: number;
  submittedAt: string | null;
  expiredAt: string | null;
  terminatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExamSessionTransitionRecord {
  transitionId: string;
  examSessionId: string;
  tenantId: string;
  transitionRequestId: string;
  fromState: ExamSessionState;
  toState: ExamSessionState;
  fromVersion: number;
  toVersion: number;
  idempotencyHash: string;
  transitionReceipt: Record<string, unknown>;
  recordedAt: string;
}

export interface ExamSessionProjectionRecord {
  projectionId: string;
  examSessionId: string;
  tenantId: string;
  packageId: string;
  shufflingSeed: string;
  presentationManifestIntegrity: string;
  questionDisplayOrder: string[];
  optionDisplayOrder: Record<string, string[]>;
  defaultLanguage: string;
  createdAt: string;
}

export interface CandidateSubmissionEventRecord {
  eventId: string;
  examSessionId: string;
  tenantId: string;
  canonicalQuestionId: string;
  representationId: string;
  packageId: string;
  packageIntegritySeal: string;
  clientSequenceNumber: number;
  serverSequenceNumber?: number;
  clientEventId: string;
  eventType: string;
  candidateResponse: Record<string, unknown>;
  responseFingerprint: string;
  receiptId: string;
  serverSignature: string;
  clientTimestamp: string;
  serverTimestamp?: string;
}

export interface CandidateQuestionStateRecord {
  stateId: string;
  examSessionId: string;
  tenantId: string;
  canonicalQuestionId: string;
  currentStateVersion: number;
  selectedOptionId: string | null;
  responsePayload: Record<string, unknown> | null;
  payloadFingerprint: string | null;
  lastServerSequence: number;
  lastClientEventId: string;
  isAnswered: boolean;
  updatedAt: string;
}

export interface CandidateEvaluationRunRecord {
  evaluationRunId: string;
  examSessionId: string;
  tenantId: string;
  packageId: string;
  packageIntegritySeal: string;
  scoringPolicyVersion: string;
  answerKeyVersion: string;
  evaluationContractTuple: Record<string, unknown>;
  runIteration: number;
  supersedesRunId: string | null;
  totalRawScore: number;
  totalNormalizedScore: number | null;
  questionsAttempted: number;
  questionsCorrect: number;
  questionsIncorrect: number;
  questionsUnanswered: number;
  evaluationSignature: string;
  evaluatedAt: string;
}

export interface CandidateQuestionScoreRecord {
  questionScoreId: string;
  evaluationRunId: string;
  tenantId: string;
  canonicalQuestionId: string;
  candidateResponseRaw: Record<string, unknown>;
  resolvedCorrectKey: Record<string, unknown>;
  isCorrect: boolean;
  isPartiallyCorrect: boolean;
  marksAwarded: number;
  penaltyDeducted: number;
  netScore: number;
  disposition: ScoringDisposition | string;
  createdAt: string;
}

export interface AuditEventRecord {
  auditEventId: string;
  tenantId: string;
  eventType: string;
  severity: 'INFO' | 'WARN' | 'CRITICAL' | 'FATAL';
  actorType: 'CANDIDATE' | 'PROCTOR' | 'STAFF' | 'SYSTEM';
  actorId: string;
  resourceType: string;
  resourceId: string;
  eventPayload: Record<string, unknown>;
  recordedAt: string;
}

export interface SessionTimerStatus {
  serverNow: string;
  actualStartedAt: string | null;
  durationSeconds: number;
  accumulatedPauseSeconds: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  deadlineAt: string | null;
  receiptGraceCutoffAt: string | null;
  isExpired: boolean;
  isWithinGracePeriod: boolean;
}

export interface SessionTransitionResult {
  transitionId: string;
  examSessionId: string;
  fromState: ExamSessionState;
  toState: ExamSessionState;
  fromVersion: number;
  toVersion: number;
  idempotentReplay: boolean;
  receipt: Record<string, unknown>;
}

export interface HeartbeatResult {
  examSessionId: string;
  leaseId: string;
  leaseHeartbeatAt: string;
  remainingSeconds: number;
  sessionState: ExamSessionState;
}

export interface SubmissionEventEnvelope {
  clientEventId: string;
  examSessionId: string;
  tenantId: string;
  candidateId?: string;
  sessionLeaseId?: string;
  packageId: string;
  packageIntegritySeal: string;
  canonicalQuestionId: string;
  representationId: string;
  clientSequenceNumber: number;
  eventType: string;
  payload: Record<string, unknown>;
  clientTimestamp: string;
}

export interface SubmissionReceipt {
  receiptId: string;
  examSessionId: string;
  clientEventId: string;
  clientSequenceNumber: number;
  serverSequenceNumber: number;
  canonicalQuestionId: string;
  responseFingerprint: string;
  serverTimestamp: string;
  validationStatus: 'ACCEPTED';
  serverSignature: string;
  idempotentReplay: boolean;
}

export interface SessionQuestionSummary {
  examSessionId: string;
  totalQuestions: number;
  answeredCount: number;
  unansweredCount: number;
  answeredQuestionIds: string[];
  unansweredQuestionIds: string[];
}

export interface CandidateScoringDisputeRecord {
  disputeId: string;
  examSessionId: string;
  tenantId: string;
  candidateId: string;
  canonicalQuestionId: string;
  evaluationRunId: string;
  disputeReason: string;
  disputeStatus: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'UNDER_REVIEW';
  resolutionNotes?: string | null;
  resolvedBy?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
}

export interface AuthoritativeResolutionBinding {
  canonicalQuestionId: string;
  resolution: AnswerAuthorityResolutionVersion;
  candidate: AnswerCandidate;
  questionTraits: QuestionScoringTraits;
}

export interface ScoringEvaluationOptions {
  examSessionId: string;
  tenantId: string;
  packageId: string;
  packageIntegritySeal: string;
  scoringPolicy: ScoringPolicyVersion;
  authoritativeKeys: AuthoritativeResolutionBinding[];
}

export interface EvaluationRunResult {
  run: CandidateEvaluationRunRecord;
  questionScores: CandidateQuestionScoreRecord[];
}

export interface EvaluationAuditVerificationResult {
  isValid: boolean;
  evaluationRunId: string;
  storedSignature: string;
  recomputedSignature: string;
  isTamperDetected: boolean;
  scoreMatch: boolean;
  storedRawScore: number;
  recomputedRawScore: number;
  discrepancies?: string[];
}

export interface SubmissionEventRecord {
  examSessionId: string;
  clientEventId: string;
  responseFingerprint: string;
  receipt: SubmissionReceipt;
  candidateResponse?: Record<string, unknown>;
}

export interface ISubmissionStore {
  getSubmissionEvent(examSessionId: string, clientEventId: string): Promise<SubmissionEventRecord | null>;
  saveSubmissionEvent(record: SubmissionEventRecord): Promise<void>;
}
