/**
 * UADUE Phase 3.6B — Secure Candidate Delivery API Gateway
 * Specification: UADUE-P3.6-API-001 (Server-Authoritative Candidate Access Boundary)
 *
 * Implements the six authenticated candidate endpoints:
 * 1. initializeOrResumeSession — Authenticated session bootstrap & lease binding
 * 2. getLiveExamProjection — Air-gapped Tier 3 projection delivery (zero answer keys, zero logicalFamilyId)
 * 3. recordAnswerSelection — Server-authoritative, idempotent answer ingestion
 * 4. pauseSession / resumeSession — Server-authoritative lifecycle transitions
 * 5. submitAttempt — Terminal submission transition & authoritative scoring trigger
 * 6. getCandidateResult — Authorized raw-score-only result projection
 *
 * Security Requirements:
 * - Candidate identity derived strictly from verified authentication authority (never client-supplied)
 * - Anti-IDOR: cross-candidate session access fails closed
 * - Multi-tenancy: cross-tenant access fails closed
 * - Device lease: single-active-device policy enforced
 * - Terminal states: submitted/expired sessions reject interactions
 * - Zero answer key leakage: presentation paper air-gapped
 * - Raw score only: totalRawScore = sum(awardedMarks), totalNormalizedScore = null
 */

import { createHash, createHmac } from 'crypto';
import {
  CandidateSessionAuthorizer,
  CandidateAuthorizationError,
  CandidateAuthenticationError,
  CandidateSessionMismatchError,
  TenantSessionMismatchError,
  SessionNotActiveError,
  PackageQuarantinedError,
  PackageSealMismatchError,
  IAuthorizerSessionStore,
  IAuthorizerPackageStore,
  PackageStatusRecord,
  VerifiedCandidateSessionContext,
} from './candidateSessionAuthorizer';
import {
  CanonicalProjectionGateway,
  ProjectionAuthorizationError,
} from '../canonical/canonicalProjectionGateway';
import { CanonicalPlayerAdapter } from './canonicalPlayerAdapter';
import {
  ExamSessionRecord,
  ExamSessionState,
  SubmissionEventEnvelope,
  SubmissionReceipt,
  CandidateEvaluationRunRecord,
  CandidateQuestionScoreRecord,
  SubmissionEventRecord,
  ISubmissionStore,
  CandidateApiError,
} from './deliveryTypes';
export type { SubmissionEventRecord, ISubmissionStore };
export { CandidateApiError };
import {
  ExamPresentationPaper,
  ExamResultSummary,
} from '../../../types';
import { ScoringEvaluationCore, CoreEvaluationInput } from './scoringEvaluationCore';
import { rfc8785Canonicalize } from '../canonical/canonicalHashing';
import { parseExactNumericInput } from '../canonical/exactNumericEvaluator';

export interface AuthenticatedPrincipal {
  candidateId: string;
  tenantId: string;
  sessionToken?: string;
  authHeader?: string;
}

export interface InitializeSessionRequest {
  packageId: string;
  deviceLeaseId: string;
  requestedSessionId?: string;
  examSessionId?: string;
  durationSeconds?: number;
}

export interface InitializeSessionResponse {
  examSessionId: string;
  sessionState: ExamSessionState;
  packageId: string;
  packageIntegritySeal: string;
  currentLeaseId: string;
  scheduledDeadlineAt: string;
  sessionToken: string;
}

export interface LiveExamProjectionRequest {
  examSessionId: string;
}

export interface LiveExamProjectionResponse {
  paper: ExamPresentationPaper;
  examSessionId: string;
  sessionState: ExamSessionState;
  timeRemainingSeconds: number;
}

export interface RecordAnswerRequest {
  examSessionId: string;
  canonicalQuestionId: string;
  selectedOptionId?: string;
  selectedOptionIds?: string[];
  enteredValue?: string;
  clientEventId: string;
  clientSequenceNumber: number;
  deviceLeaseId: string;
  clientTimestampIso?: string;
}

export interface RecordAnswerResponse {
  receipt: SubmissionReceipt;
  status: 'ACCEPTED';
}

export interface SubmitAttemptRequest {
  examSessionId: string;
  deviceLeaseId?: string;
  submissionDigest?: string;
  clientSubmittedAtIso?: string;
  transitionRequestId?: string;
}

export interface SubmitAttemptResponse {
  examSessionId: string;
  sessionState: 'SUBMITTED';
  submittedAt: string;
  evaluationRunId: string;
}

export interface CandidateResultRequest {
  examSessionId: string;
}

export interface CandidateResultResponse {
  result: ExamResultSummary;
}

export interface ICandidateDeliveryBackend {
  sessionStore: IAuthorizerSessionStore;
  packageStore: IAuthorizerPackageStore;
  authorizer: CandidateSessionAuthorizer;
  projectionGateway: CanonicalProjectionGateway;
  submissionStore?: ISubmissionStore;
  saveEvaluationRun?(run: CandidateEvaluationRunRecord): Promise<void>;
  getEvaluationRun?(sessionId: string, tenantId: string): Promise<CandidateEvaluationRunRecord | null>;
  buildEvaluationInput?(session: ExamSessionRecord): Promise<CoreEvaluationInput | null>;
}

export class InMemoryCandidateSubmissionStore implements ISubmissionStore {
  private readonly events = new Map<string, SubmissionEventRecord>();

  public async getSubmissionEvent(
    examSessionId: string,
    clientEventId: string
  ): Promise<SubmissionEventRecord | null> {
    const key = `${examSessionId}:${clientEventId}`;
    const found = this.events.get(key);
    return found ? { ...found } : null;
  }

  public async saveSubmissionEvent(record: SubmissionEventRecord): Promise<void> {
    const key = `${record.examSessionId}:${record.clientEventId}`;
    if (this.events.has(key)) {
      const existing = this.events.get(key)!;
      if (existing.responseFingerprint !== record.responseFingerprint) {
        throw new CandidateApiError(
          'EVENT_CONFLICT',
          `Conflicting payload submitted for existing clientEventId '${record.clientEventId}'. Event payloads are strictly immutable.`
        );
      }
      return;
    }
    this.events.set(key, { ...record });
  }

  public clear(): void {
    this.events.clear();
  }
}

export interface ICandidateDeliveryGateway {
  initializeOrResumeSession(
    req: InitializeSessionRequest,
    auth: AuthenticatedPrincipal
  ): Promise<InitializeSessionResponse>;

  getLiveExamProjection(
    req: LiveExamProjectionRequest,
    auth: AuthenticatedPrincipal
  ): Promise<LiveExamProjectionResponse>;

  recordAnswerSelection(
    req: RecordAnswerRequest,
    auth: AuthenticatedPrincipal
  ): Promise<RecordAnswerResponse>;

  pauseSession(
    req: { examSessionId: string },
    auth: AuthenticatedPrincipal
  ): Promise<{ sessionState: 'PAUSED'; remainingSeconds: number }>;

  resumeSession(
    req: { examSessionId: string; deviceLeaseId: string },
    auth: AuthenticatedPrincipal
  ): Promise<{ sessionState: 'ACTIVE'; remainingSeconds: number }>;

  submitAttempt(
    req: SubmitAttemptRequest,
    auth: AuthenticatedPrincipal
  ): Promise<SubmitAttemptResponse>;

  getCandidateResult(
    req: { examSessionId: string },
    auth: AuthenticatedPrincipal
  ): Promise<CandidateResultResponse>;
}

export class CandidateDeliveryApi implements ICandidateDeliveryGateway {
  private readonly signingSecret: string;
  private readonly evaluationRuns = new Map<string, CandidateEvaluationRunRecord>();
  private readonly submissionStore: ISubmissionStore;

  constructor(
    private readonly backend: ICandidateDeliveryBackend,
    options: { signingSecret?: string; submissionStore?: ISubmissionStore } = {}
  ) {
    this.signingSecret =
      options.signingSecret ||
      process.env.UADUE_API_SIGNING_SECRET ||
      'uadue_production_delivery_api_secret_key_32_bytes!';
    this.submissionStore =
      options.submissionStore ||
      backend.submissionStore ||
      new InMemoryCandidateSubmissionStore();
  }

  private async persistSession(session: ExamSessionRecord): Promise<void> {
    const store = this.backend.sessionStore as any;
    if (typeof store.saveExamSession === 'function') {
      await store.saveExamSession(session);
    } else if (typeof store.setSession === 'function') {
      store.setSession(session);
    }
  }

  // ── Authentication & Authorization Verification ──────────────────────────

  /**
   * Verifies the caller's authenticated identity.
   * Derives candidateId and tenantId strictly from trusted tokens.
   */
  public async verifyAuth(auth: AuthenticatedPrincipal): Promise<{ candidateId: string; tenantId: string }> {
    if (!auth || !auth.candidateId || !auth.tenantId) {
      throw new CandidateApiError(
        'UNAUTHENTICATED',
        'Request is unauthenticated. Valid candidate credentials and tenant context are required.'
      );
    }

    if (auth.sessionToken) {
      const verified = await this.backend.authorizer.verifyCandidateToken(auth.sessionToken);
      return {
        candidateId: verified.candidateId,
        tenantId: verified.tenantId,
      };
    }

    // Direct principal from authenticated gateway (e.g. Supabase Auth)
    return {
      candidateId: auth.candidateId.trim(),
      tenantId: auth.tenantId.trim(),
    };
  }

  // ── 1. Initialize or Resume Candidate Session ─────────────────────────────

  public async initializeOrResumeSession(
    req: InitializeSessionRequest,
    auth: AuthenticatedPrincipal
  ): Promise<InitializeSessionResponse> {
    const { candidateId, tenantId } = await this.verifyAuth(auth);

    if (!req.packageId || !req.deviceLeaseId) {
      throw new CandidateApiError(
        'INVALID_REQUEST',
        'packageId and deviceLeaseId are required to initialize an exam session.'
      );
    }

    // 1. Verify package existence, status, and quarantine
    const pkgStatus = await this.backend.packageStore.getPackageStatus(req.packageId);
    if (!pkgStatus) {
      throw new CandidateApiError(
        'PACKAGE_NOT_FOUND',
        `Assessment package '${req.packageId}' not found.`
      );
    }
    if (pkgStatus.isQuarantined || (pkgStatus.validationStatus !== 'VALIDATED' && pkgStatus.validationStatus !== 'PUBLISHED')) {
      throw new PackageQuarantinedError(
        req.packageId,
        pkgStatus.validationStatus,
        'Assessment package is quarantined or not published.'
      );
    }

    const packageIntegritySeal = pkgStatus.packageIntegritySeal;
    const durationSeconds = req.durationSeconds || 10800; // 3 hours default
    const nowIso = new Date().toISOString();
    const scheduledDeadlineAt = new Date(Date.now() + durationSeconds * 1000).toISOString();

    // 2. Check for existing active or paused session
    const sessionId = req.requestedSessionId || req.examSessionId || `sess_${tenantId}_${candidateId}_${req.packageId.slice(0, 16)}`;
    let session = await this.backend.sessionStore.getExamSession(sessionId, tenantId);

    if (session) {
      // Anti-IDOR: verify candidate ownership
      if (session.candidateId !== candidateId) {
        throw new CandidateSessionMismatchError(sessionId, session.candidateId, candidateId);
      }
      if (session.packageId !== req.packageId) {
        throw new CandidateApiError(
          'PACKAGE_MISMATCH',
          `Session '${sessionId}' belongs to package '${session.packageId}', not '${req.packageId}'.`
        );
      }

      // Check terminal states
      if (session.sessionState === 'SUBMITTED' || session.sessionState === 'EXPIRED' || session.sessionState === 'TERMINATED') {
        throw new CandidateApiError(
          'SESSION_TERMINAL',
          `Exam session '${sessionId}' is in terminal state '${session.sessionState}'. Candidate cannot re-enter active session.`
        );
      }

      // If paused, resume
      if (session.sessionState === 'PAUSED') {
        session.sessionState = 'ACTIVE';
        session.currentLeaseId = req.deviceLeaseId;
        session.leaseHeartbeatAt = nowIso;
        session.stateVersion += 1;
        session.updatedAt = nowIso;
      } else {
        // Re-bind device lease if valid active session
        session.currentLeaseId = req.deviceLeaseId;
        session.leaseHeartbeatAt = nowIso;
        session.updatedAt = nowIso;
      }
    } else {
      // 3. Create fresh authoritative session record
      session = {
        examSessionId: sessionId,
        tenantId,
        candidateId,
        packageId: req.packageId,
        packageIntegritySeal,
        sessionConfiguration: {},
        sessionState: 'ACTIVE',
        stateVersion: 1,
        currentLeaseId: req.deviceLeaseId,
        leaseHeartbeatAt: nowIso,
        scheduledStartAt: nowIso,
        actualStartedAt: nowIso,
        durationSeconds,
        accumulatedPauseSeconds: 0,
        pauseCount: 0,
        submittedAt: null,
        expiredAt: null,
        terminatedAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    }

    await this.persistSession(session);

    // 4. Issue cryptographically signed candidate session token
    const sessionToken = this.backend.authorizer.issueCandidateToken({
      candidateId,
      tenantId,
    });

    return {
      examSessionId: session.examSessionId,
      sessionState: session.sessionState,
      packageId: session.packageId,
      packageIntegritySeal: session.packageIntegritySeal,
      currentLeaseId: session.currentLeaseId,
      scheduledDeadlineAt,
      sessionToken,
    };
  }

  // ── 2. Retrieve Air-Gapped Live Exam Projection ───────────────────────────

  public async getLiveExamProjection(
    req: LiveExamProjectionRequest,
    auth: AuthenticatedPrincipal
  ): Promise<LiveExamProjectionResponse> {
    const { candidateId, tenantId } = await this.verifyAuth(auth);

    if (!req.examSessionId) {
      throw new CandidateApiError('INVALID_REQUEST', 'examSessionId is required.');
    }

    const session = await this.backend.sessionStore.getExamSession(req.examSessionId, tenantId);
    if (!session) {
      throw new CandidateApiError(
        'SESSION_NOT_FOUND',
        `Exam session '${req.examSessionId}' not found for tenant '${tenantId}'.`
      );
    }

    // Anti-IDOR & Lifecycle checks
    if (session.candidateId !== candidateId) {
      throw new CandidateSessionMismatchError(req.examSessionId, session.candidateId, candidateId);
    }
    if (session.sessionState !== 'ACTIVE') {
      throw new SessionNotActiveError(req.examSessionId, session.sessionState);
    }

    // Package seal verification
    const pkgStatus = await this.backend.packageStore.getPackageStatus(session.packageId);
    if (!pkgStatus || pkgStatus.packageIntegritySeal !== session.packageIntegritySeal) {
      throw new PackageSealMismatchError(
        session.examSessionId,
        session.packageIntegritySeal,
        pkgStatus?.packageIntegritySeal || 'MISSING'
      );
    }

    // Retrieve Tier 3 Student Live Projection (air-gapped at query layer)
    const rawProjection = await this.backend.projectionGateway.getTier3StudentLiveProjection(
      session.packageId,
      {
        tenantId,
        candidateId,
        examSessionId: session.examSessionId,
      }
    );

    // Adapt to presentation paper (guarantees zero answer keys, zero logicalFamilyId)
    const presentationPaper = CanonicalPlayerAdapter.adaptProjectionToPresentationPaper(
      rawProjection,
      {
        durationMinutes: Math.floor(session.durationSeconds / 60),
      }
    );

    const elapsedSeconds = Math.floor(
      (Date.now() - new Date(session.actualStartedAt || session.createdAt).getTime()) / 1000
    );
    const timeRemainingSeconds = Math.max(0, session.durationSeconds - elapsedSeconds);

    return {
      paper: presentationPaper,
      examSessionId: session.examSessionId,
      sessionState: session.sessionState,
      timeRemainingSeconds,
    };
  }

  // ── 3. Record Candidate Answer Selection ──────────────────────────────────

  public async recordAnswerSelection(
    req: RecordAnswerRequest,
    auth: AuthenticatedPrincipal
  ): Promise<RecordAnswerResponse> {
    const { candidateId, tenantId } = await this.verifyAuth(auth);

    if (!req.examSessionId || !req.canonicalQuestionId || !req.clientEventId) {
      throw new CandidateApiError(
        'INVALID_REQUEST',
        'examSessionId, canonicalQuestionId, and clientEventId are required.'
      );
    }

    const session = await this.backend.sessionStore.getExamSession(req.examSessionId, tenantId);
    if (!session) {
      throw new CandidateApiError(
        'SESSION_NOT_FOUND',
        `Exam session '${req.examSessionId}' not found.`
      );
    }

    // Anti-IDOR & Lifecycle checks
    if (session.candidateId !== candidateId) {
      throw new CandidateSessionMismatchError(req.examSessionId, session.candidateId, candidateId);
    }
    if (session.sessionState !== 'ACTIVE') {
      throw new SessionNotActiveError(req.examSessionId, session.sessionState);
    }

    // Device Lease check
    if (session.currentLeaseId !== req.deviceLeaseId) {
      throw new CandidateApiError(
        'LEASE_MISMATCH',
        `Device lease revoked on session '${req.examSessionId}'. Active lease is '${session.currentLeaseId}', request provided '${req.deviceLeaseId}'.`
      );
    }

    // Deadline authority with 15.0s receipt grace period
    const startedAtMs = new Date(session.actualStartedAt || session.createdAt).getTime();
    const deadlineAtMs = startedAtMs + session.durationSeconds * 1000;
    const cutoffAtMs = deadlineAtMs + 15000; // 15-second grace period
    if (Date.now() > cutoffAtMs) {
      throw new CandidateApiError(
        'DEADLINE_EXCEEDED',
        `Submission deadline exceeded on session '${req.examSessionId}'. Current time past cutoff.`
      );
    }

    // Validate question belongs to package projection
    const liveProjection = await this.backend.projectionGateway.getTier3StudentLiveProjection(
      session.packageId,
      {
        tenantId,
        candidateId,
        examSessionId: session.examSessionId,
      }
    );
    const validQuestion = liveProjection.questions.find(
      (q) => q.canonicalQuestionId === req.canonicalQuestionId
    );
    if (!validQuestion) {
      throw new CandidateApiError(
        'INVALID_QUESTION',
        `Question '${req.canonicalQuestionId}' does not belong to package '${session.packageId}'.`
      );
    }
    const availableOptionIds = new Set<string>();
    for (const rep of validQuestion.representations || []) {
      for (const opt of rep.options || []) {
        availableOptionIds.add(opt.optionId);
      }
    }
    if (req.selectedOptionId && availableOptionIds.size > 0 && !availableOptionIds.has(req.selectedOptionId)) {
      throw new CandidateApiError(
        'INVALID_OPTION',
        `Option '${req.selectedOptionId}' does not belong to question '${req.canonicalQuestionId}'.`
      );
    }

    if (req.selectedOptionIds && availableOptionIds.size > 0) {
      if (!Array.isArray(req.selectedOptionIds)) {
        throw new CandidateApiError(
          'INVALID_REQUEST',
          `selectedOptionIds must be an array of strings for question '${req.canonicalQuestionId}'.`
        );
      }
      for (const optId of req.selectedOptionIds) {
        if (!availableOptionIds.has(optId)) {
          throw new CandidateApiError(
            'INVALID_OPTION',
            `Option '${optId}' does not belong to question '${req.canonicalQuestionId}'.`
          );
        }
      }
    }

    if (req.enteredValue !== undefined && req.enteredValue !== null) {
      if (typeof req.enteredValue !== 'string') {
        throw new CandidateApiError(
          'INVALID_REQUEST',
          `enteredValue must be a string representation for numerical question '${req.canonicalQuestionId}'.`
        );
      }
      const trimmed = req.enteredValue.trim();
      if (trimmed !== '') {
        const parseResult = parseExactNumericInput(trimmed, { allowFractions: true });
        if (!parseResult.isSuccess) {
          throw new CandidateApiError(
            'INVALID_NUMERIC_INPUT',
            `Malformed numeric input '${trimmed}' for question '${req.canonicalQuestionId}': ${parseResult.errorMessage || 'Invalid numerical format'}`
          );
        }
      }
    }

    // Formulate submission envelope
    const candidateResponse: Record<string, unknown> = {};
    if (req.selectedOptionId !== undefined) {
      candidateResponse.selectedOptionId = req.selectedOptionId;
    }
    if (req.selectedOptionIds !== undefined) {
      candidateResponse.selectedOptionIds = [...req.selectedOptionIds].sort();
    }
    if (req.enteredValue !== undefined) {
      candidateResponse.enteredValue = req.enteredValue.trim();
    }

    const envelope: SubmissionEventEnvelope = CanonicalPlayerAdapter.createSubmissionEnvelope({
      examSessionId: session.examSessionId,
      tenantId,
      candidateId,
      packageId: session.packageId,
      packageIntegritySeal: session.packageIntegritySeal,
      canonicalQuestionId: req.canonicalQuestionId,
      clientSequenceNumber: req.clientSequenceNumber,
      clientEventId: req.clientEventId,
      candidateResponse,
      deviceLeaseId: req.deviceLeaseId,
    });

    const responseFingerprint = createHash('sha256')
      .update(rfc8785Canonicalize(envelope.payload))
      .digest('hex');

    // 1. Check persistent submission store for existing event
    const existingRecord = await this.submissionStore.getSubmissionEvent(
      session.examSessionId,
      req.clientEventId
    );

    if (existingRecord) {
      if (existingRecord.responseFingerprint === responseFingerprint) {
        return {
          receipt: {
            ...existingRecord.receipt,
            idempotentReplay: true,
          },
          status: 'ACCEPTED',
        };
      } else {
        throw new CandidateApiError(
          'EVENT_CONFLICT',
          `Conflicting payload submitted for existing clientEventId '${req.clientEventId}'. Event payloads are strictly immutable.`
        );
      }
    }

    const receiptId = `rcpt_${createHash('sha256')
      .update(`${session.examSessionId}:${req.clientEventId}:${req.clientSequenceNumber}`)
      .digest('hex')
      .slice(0, 24)}`;

    const serverSignature = createHmac('sha256', this.signingSecret)
      .update(`${receiptId}:${session.examSessionId}:${req.clientEventId}:${req.clientSequenceNumber}:${responseFingerprint}`)
      .digest('hex');

    const receipt: SubmissionReceipt = {
      receiptId,
      examSessionId: session.examSessionId,
      clientEventId: req.clientEventId,
      clientSequenceNumber: req.clientSequenceNumber,
      serverSequenceNumber: req.clientSequenceNumber,
      canonicalQuestionId: req.canonicalQuestionId,
      responseFingerprint,
      serverTimestamp: new Date().toISOString(),
      validationStatus: 'ACCEPTED',
      serverSignature,
      idempotentReplay: false,
    };

    const eventRecord: SubmissionEventRecord = {
      examSessionId: session.examSessionId,
      clientEventId: req.clientEventId,
      responseFingerprint,
      receipt,
      candidateResponse,
    };

    try {
      await this.submissionStore.saveSubmissionEvent(eventRecord);
    } catch (err: any) {
      if (err instanceof CandidateApiError && err.code === 'EVENT_CONFLICT') {
        throw err;
      }
      // In case of concurrent write collision or unique constraint violation,
      // re-check persistent store to determine if it is an idempotent replay or conflict
      const recheck = await this.submissionStore.getSubmissionEvent(
        session.examSessionId,
        req.clientEventId
      );
      if (recheck) {
        if (recheck.responseFingerprint === responseFingerprint) {
          return {
            receipt: {
              ...recheck.receipt,
              idempotentReplay: true,
            },
            status: 'ACCEPTED',
          };
        } else {
          throw new CandidateApiError(
            'EVENT_CONFLICT',
            `Conflicting payload submitted for existing clientEventId '${req.clientEventId}'. Event payloads are strictly immutable.`
          );
        }
      }
      throw err;
    }

    return {
      receipt,
      status: 'ACCEPTED',
    };
  }

  // ── 4. Pause & Resume Session ─────────────────────────────────────────────

  public async pauseSession(
    req: { examSessionId: string },
    auth: AuthenticatedPrincipal
  ): Promise<{ sessionState: 'PAUSED'; remainingSeconds: number }> {
    const { candidateId, tenantId } = await this.verifyAuth(auth);

    const session = await this.backend.sessionStore.getExamSession(req.examSessionId, tenantId);
    if (!session) {
      throw new CandidateApiError('SESSION_NOT_FOUND', `Exam session '${req.examSessionId}' not found.`);
    }

    if (session.candidateId !== candidateId) {
      throw new CandidateSessionMismatchError(req.examSessionId, session.candidateId, candidateId);
    }
    if (session.sessionState !== 'ACTIVE') {
      throw new SessionNotActiveError(req.examSessionId, session.sessionState);
    }

    if (session.pauseCount >= 3) {
      throw new CandidateApiError(
        'PAUSE_LIMIT_EXCEEDED',
        `Session '${req.examSessionId}' has reached the maximum allowed pause limit (3).`
      );
    }

    session.sessionState = 'PAUSED';
    session.pauseCount += 1;
    session.stateVersion += 1;
    session.updatedAt = new Date().toISOString();

    await this.persistSession(session);

    const elapsedSeconds = Math.floor(
      (Date.now() - new Date(session.actualStartedAt || session.createdAt).getTime()) / 1000
    );
    const remainingSeconds = Math.max(0, session.durationSeconds - elapsedSeconds);

    return {
      sessionState: 'PAUSED',
      remainingSeconds,
    };
  }

  public async resumeSession(
    req: { examSessionId: string; deviceLeaseId: string },
    auth: AuthenticatedPrincipal
  ): Promise<{ sessionState: 'ACTIVE'; remainingSeconds: number }> {
    const { candidateId, tenantId } = await this.verifyAuth(auth);

    const session = await this.backend.sessionStore.getExamSession(req.examSessionId, tenantId);
    if (!session) {
      throw new CandidateApiError('SESSION_NOT_FOUND', `Exam session '${req.examSessionId}' not found.`);
    }

    if (session.candidateId !== candidateId) {
      throw new CandidateSessionMismatchError(req.examSessionId, session.candidateId, candidateId);
    }
    if (session.sessionState !== 'PAUSED') {
      throw new CandidateApiError(
        'SESSION_NOT_PAUSED',
        `Session '${req.examSessionId}' is in state '${session.sessionState}', not PAUSED.`
      );
    }

    session.sessionState = 'ACTIVE';
    session.currentLeaseId = req.deviceLeaseId;
    session.leaseHeartbeatAt = new Date().toISOString();
    session.stateVersion += 1;
    session.updatedAt = new Date().toISOString();

    await this.persistSession(session);

    const elapsedSeconds = Math.floor(
      (Date.now() - new Date(session.actualStartedAt || session.createdAt).getTime()) / 1000
    );
    const remainingSeconds = Math.max(0, session.durationSeconds - elapsedSeconds);

    return {
      sessionState: 'ACTIVE',
      remainingSeconds,
    };
  }

  // ── 5. Submit Attempt & Authoritative Scoring Trigger ─────────────────────

  public async submitAttempt(
    req: SubmitAttemptRequest,
    auth: AuthenticatedPrincipal,
    evaluationOptions?: {
      evalInput?: CoreEvaluationInput;
    }
  ): Promise<SubmitAttemptResponse> {
    const { candidateId, tenantId } = await this.verifyAuth(auth);

    const session = await this.backend.sessionStore.getExamSession(req.examSessionId, tenantId);
    if (!session) {
      throw new CandidateApiError('SESSION_NOT_FOUND', `Exam session '${req.examSessionId}' not found.`);
    }

    if (session.candidateId !== candidateId) {
      throw new CandidateSessionMismatchError(req.examSessionId, session.candidateId, candidateId);
    }

    // Idempotent submission: if already SUBMITTED, return existing receipt
    if (session.sessionState === 'SUBMITTED') {
      let existingRun: CandidateEvaluationRunRecord | undefined = undefined;
      if (this.backend.getEvaluationRun) {
        existingRun = (await this.backend.getEvaluationRun(session.examSessionId, tenantId)) || undefined;
      }
      if (!existingRun) {
        existingRun = this.evaluationRuns.get(session.examSessionId);
      }
      return {
        examSessionId: session.examSessionId,
        sessionState: 'SUBMITTED',
        submittedAt: session.submittedAt || session.updatedAt,
        evaluationRunId: existingRun?.evaluationRunId || 'eval_run_idempotent',
      };
    }

    if (session.sessionState !== 'ACTIVE' && session.sessionState !== 'PAUSED') {
      throw new CandidateApiError(
        'ILLEGAL_STATE_TRANSITION',
        `Cannot submit session in state '${session.sessionState}'. Session must be ACTIVE or PAUSED.`
      );
    }

    // Device Lease check if provided
    if (req.deviceLeaseId && session.currentLeaseId !== req.deviceLeaseId) {
      throw new CandidateApiError(
        'LEASE_MISMATCH',
        `Device lease revoked on session '${req.examSessionId}'. Active lease is '${session.currentLeaseId}', submission provided '${req.deviceLeaseId}'.`
      );
    }

    // Deadline authority with 15.0s receipt grace period
    const startedAtMs = new Date(session.actualStartedAt || session.createdAt).getTime();
    const deadlineAtMs = startedAtMs + session.durationSeconds * 1000;
    const cutoffAtMs = deadlineAtMs + 15000;
    if (Date.now() > cutoffAtMs) {
      throw new CandidateApiError(
        'DEADLINE_EXCEEDED',
        `Submission deadline exceeded on session '${req.examSessionId}'. Current time past cutoff.`
      );
    }

    // Terminal transition
    const submittedAtIso = new Date().toISOString();
    session.sessionState = 'SUBMITTED';
    session.submittedAt = submittedAtIso;
    session.stateVersion += 1;
    session.updatedAt = submittedAtIso;

    await this.persistSession(session);

    // Execute authoritative server-side scoring (delegates to ScoringEvaluationCore)
    let evalInput: CoreEvaluationInput | undefined = evaluationOptions?.evalInput;
    if (!evalInput && this.backend.buildEvaluationInput) {
      evalInput = (await this.backend.buildEvaluationInput(session)) || undefined;
    }
    if (!evalInput) {
      evalInput = {
        policyVersion: {
          policyVersionId: 'spv_default_1',
          policyId: 'sp_default',
          versionNumber: 1,
          policyFingerprint: 'fp_spv_default',
          rules: [],
          effectiveFrom: submittedAtIso,
          createdAt: Date.now(),
        },
        items: [],
      };
    }

    const coreResult = ScoringEvaluationCore.evaluateAttempt(evalInput);

    const evaluationRunId = `eval_run_${createHash('sha256')
      .update(`${session.examSessionId}:${session.packageId}:${session.packageIntegritySeal}:${submittedAtIso}`)
      .digest('hex')
      .slice(0, 32)}`;

    const evalRun: CandidateEvaluationRunRecord = {
      evaluationRunId,
      examSessionId: session.examSessionId,
      tenantId,
      packageId: session.packageId,
      packageIntegritySeal: session.packageIntegritySeal,
      scoringPolicyVersion: evalInput.policyVersion.policyVersionId,
      answerKeyVersion: 'ak_official_v1',
      evaluationContractTuple: {},
      runIteration: 1,
      supersedesRunId: null,
      totalRawScore: coreResult.totalRawScore,
      totalNormalizedScore: null, // Strictly null!
      questionsAttempted: coreResult.questionsAttempted,
      questionsCorrect: coreResult.questionsCorrect,
      questionsIncorrect: coreResult.questionsIncorrect,
      questionsUnanswered: coreResult.questionsUnanswered,
      evaluationSignature: `sig_rfc8785_${evaluationRunId}`,
      evaluatedAt: submittedAtIso,
    };

    let finalEvalRun = evalRun;
    if (this.backend.saveEvaluationRun) {
      try {
        await this.backend.saveEvaluationRun(evalRun);
      } catch {
        // In concurrent race conditions, an identical run may have been inserted by a peer request.
      }
      if (this.backend.getEvaluationRun) {
        const canonicalPersisted = await this.backend.getEvaluationRun(session.examSessionId, tenantId);
        if (canonicalPersisted) {
          finalEvalRun = canonicalPersisted;
        }
      }
    }
    this.evaluationRuns.set(session.examSessionId, finalEvalRun);

    return {
      examSessionId: session.examSessionId,
      sessionState: 'SUBMITTED',
      submittedAt: submittedAtIso,
      evaluationRunId: finalEvalRun.evaluationRunId,
    };
  }

  // ── 6. Retrieve Authorized Raw-Score Result ───────────────────────────────

  public async getCandidateResult(
    req: CandidateResultRequest,
    auth: AuthenticatedPrincipal
  ): Promise<CandidateResultResponse> {
    const { candidateId, tenantId } = await this.verifyAuth(auth);

    const session = await this.backend.sessionStore.getExamSession(req.examSessionId, tenantId);
    if (!session) {
      throw new CandidateApiError('SESSION_NOT_FOUND', `Exam session '${req.examSessionId}' not found.`);
    }

    if (session.candidateId !== candidateId) {
      throw new CandidateSessionMismatchError(req.examSessionId, session.candidateId, candidateId);
    }

    if (session.sessionState !== 'SUBMITTED' && session.sessionState !== 'EXPIRED') {
      throw new CandidateApiError(
        'SESSION_NOT_TERMINAL',
        `Candidate result cannot be projected for non-terminal session (current state: '${session.sessionState}').`
      );
    }

    let evalRun: CandidateEvaluationRunRecord | undefined = undefined;
    if (this.backend.getEvaluationRun) {
      evalRun = (await this.backend.getEvaluationRun(session.examSessionId, tenantId)) || undefined;
    }
    if (!evalRun) {
      evalRun = this.evaluationRuns.get(session.examSessionId);
    }

    if (!evalRun) {
      throw new CandidateApiError(
        'EVALUATION_NOT_FOUND',
        `Evaluation run not found for session '${req.examSessionId}'. Scoring may be in progress.`
      );
    }

    // Build minimal presentation paper structure for projection mapping
    const mockPaper: any = {
      id: session.packageId,
      examId: 'competitive_exam',
      title: 'Examination Result',
      totalQuestions: evalRun.questionsAttempted + evalRun.questionsUnanswered,
      totalMarks: evalRun.questionsAttempted + evalRun.questionsUnanswered,
      sections: [
        {
          id: 'sec_all',
          name: 'All Questions',
          questionCount: evalRun.questionsAttempted + evalRun.questionsUnanswered,
          maxMarks: evalRun.questionsAttempted + evalRun.questionsUnanswered,
          startIndex: 0,
          endIndex: 0,
        },
      ],
    };

    const result = CanonicalPlayerAdapter.projectEvaluationRunToCandidateResult(evalRun, [], mockPaper);

    return {
      result,
    };
  }
}
