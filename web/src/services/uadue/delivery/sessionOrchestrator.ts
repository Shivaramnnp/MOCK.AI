/**
 * UADUE Phase 3.2 — Session Orchestration Engine
 * Specification: UADUE-P3-HARD-R3-001 (R3 Final Hardened Contract)
 * FSM Model: UADUE-P3-FSM-004
 *
 * Implements server-authoritative examination lifecycle orchestration:
 * 1. Complete FSM (INITIALIZED -> ACTIVE -> PAUSED -> RECOVERY_PENDING -> SUBMITTED / EXPIRED / TERMINATED)
 * 2. Strict terminal state enforcement (SUBMITTED, EXPIRED, TERMINATED reject all further transitions)
 * 3. Optimistic concurrency control (state_version gating with FOR UPDATE row locking)
 * 4. Request idempotency on (exam_session_id, transition_request_id)
 * 5. Lease management & heartbeat tracking
 * 6. Authoritative server timers & deadline calculation with 15.000s receipt grace period (R2-01 / R3-05)
 * 7. Automatic transition ledger and audit event emission
 */

import { PoolClient } from 'pg';
import { createHash } from 'crypto';
import {
  DeliveryPostgresAdapter,
  DeliveryUniqueConstraintError,
} from './deliveryPostgresAdapter';
import {
  ExamSessionRecord,
  ExamSessionState,
  ExamSessionTransitionRecord,
  SessionTimerStatus,
  SessionTransitionResult,
  HeartbeatResult,
  AuditEventRecord,
} from './deliveryTypes';

export class SessionNotFoundError extends Error {
  constructor(public readonly sessionId: string) {
    super(`Exam session not found: ${sessionId}`);
    this.name = 'SessionNotFoundError';
  }
}

export class SessionIllegalStateTransitionError extends Error {
  constructor(
    public readonly sessionId: string,
    public readonly fromState: ExamSessionState,
    public readonly toState: ExamSessionState,
    public readonly reason: string
  ) {
    super(
      `Illegal session state transition on ${sessionId} from ${fromState} to ${toState}: ${reason}`
    );
    this.name = 'SessionIllegalStateTransitionError';
  }
}

export class SessionConcurrencyConflictError extends Error {
  constructor(
    public readonly sessionId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number
  ) {
    super(
      `Session concurrency conflict on ${sessionId}: expected state version ${expectedVersion}, but found ${actualVersion}`
    );
    this.name = 'SessionConcurrencyConflictError';
  }
}

export class SessionAlreadySubmittedError extends Error {
  constructor(public readonly sessionId: string) {
    super(`Exam session ${sessionId} is already SUBMITTED. Further transitions are forbidden.`);
    this.name = 'SessionAlreadySubmittedError';
  }
}

export class SessionExpiredError extends Error {
  constructor(public readonly sessionId: string) {
    super(`Exam session ${sessionId} is EXPIRED. Further transitions are forbidden.`);
    this.name = 'SessionExpiredError';
  }
}

export class SessionTerminatedError extends Error {
  constructor(public readonly sessionId: string) {
    super(`Exam session ${sessionId} is TERMINATED. Further transitions are forbidden.`);
    this.name = 'SessionTerminatedError';
  }
}

export class SessionLeaseMismatchError extends Error {
  constructor(
    public readonly sessionId: string,
    public readonly currentLease: string,
    public readonly requestedLease: string
  ) {
    super(
      `Session lease mismatch on ${sessionId}: expected ${currentLease}, got ${requestedLease}`
    );
    this.name = 'SessionLeaseMismatchError';
  }
}

export class SessionPauseLimitExceededError extends Error {
  constructor(
    public readonly sessionId: string,
    public readonly pauseCount: number,
    public readonly maxPauses: number
  ) {
    super(
      `Session ${sessionId} exceeded maximum allowed pauses (${pauseCount} >= ${maxPauses})`
    );
    this.name = 'SessionPauseLimitExceededError';
  }
}

export class SessionGracePeriodExceededError extends Error {
  constructor(
    public readonly sessionId: string,
    public readonly elapsedSeconds: number,
    public readonly maxGraceSeconds: number
  ) {
    super(
      `Session recovery grace period exceeded on ${sessionId}: disconnected for ${elapsedSeconds}s (max allowed: ${maxGraceSeconds}s)`
    );
    this.name = 'SessionGracePeriodExceededError';
  }
}

export interface SessionOrchestratorConfig {
  heartbeatTimeoutSeconds?: number;
  maxRecoveryGraceSeconds?: number;
  maxAllowedPauses?: number;
  transportGraceSeconds?: number;
}

export class SessionOrchestrator {
  private readonly heartbeatTimeoutSeconds: number;
  private readonly maxRecoveryGraceSeconds: number;
  private readonly maxAllowedPauses: number;
  private readonly transportGraceSeconds: number;

  constructor(
    private readonly adapter: DeliveryPostgresAdapter,
    config: SessionOrchestratorConfig = {}
  ) {
    this.heartbeatTimeoutSeconds = config.heartbeatTimeoutSeconds ?? 30;
    this.maxRecoveryGraceSeconds = config.maxRecoveryGraceSeconds ?? 120;
    this.maxAllowedPauses = config.maxAllowedPauses ?? 3;
    this.transportGraceSeconds = config.transportGraceSeconds ?? 15.0; // Hardened 15-second receipt grace
  }

  /**
   * Validate state transition against formal FSM matrix (UADUE-P3-FSM-004)
   */
  public validateTransition(
    sessionId: string,
    fromState: ExamSessionState,
    toState: ExamSessionState
  ): void {
    // 1. Terminal states reject ALL transitions
    if (fromState === 'SUBMITTED') {
      throw new SessionAlreadySubmittedError(sessionId);
    }
    if (fromState === 'EXPIRED') {
      throw new SessionExpiredError(sessionId);
    }
    if (fromState === 'TERMINATED') {
      throw new SessionTerminatedError(sessionId);
    }

    // 2. Valid state transitions matrix
    const validTransitions: Record<ExamSessionState, ExamSessionState[]> = {
      INITIALIZED: ['ACTIVE', 'TERMINATED'],
      ACTIVE: ['PAUSED', 'RECOVERY_PENDING', 'SUBMITTED', 'EXPIRED', 'TERMINATED'],
      PAUSED: ['ACTIVE', 'TERMINATED'],
      RECOVERY_PENDING: ['ACTIVE', 'EXPIRED', 'TERMINATED'],
      SUBMITTED: [],
      EXPIRED: [],
      TERMINATED: [],
    };

    const allowed = validTransitions[fromState] || [];
    if (!allowed.includes(toState)) {
      throw new SessionIllegalStateTransitionError(
        sessionId,
        fromState,
        toState,
        `Transition from ${fromState} to ${toState} is not allowed by FSM policy.`
      );
    }
  }

  /**
   * Start Session: INITIALIZED -> ACTIVE
   */
  public async startSession(params: {
    sessionId: string;
    tenantId: string;
    transitionRequestId: string;
    leaseId: string;
    candidateId: string;
  }): Promise<SessionTransitionResult> {
    return this.executeTransition({
      sessionId: params.sessionId,
      tenantId: params.tenantId,
      transitionRequestId: params.transitionRequestId,
      targetState: 'ACTIVE',
      expectedState: 'INITIALIZED',
      actorType: 'CANDIDATE',
      actorId: params.candidateId,
      eventType: 'SESSION_STARTED',
      receiptPayload: {
        leaseId: params.leaseId,
        startedAt: new Date().toISOString(),
      },
      applyMutations: (session, nowIso) => ({
        actualStartedAt: session.actualStartedAt || nowIso,
        currentLeaseId: params.leaseId,
        leaseHeartbeatAt: nowIso,
      }),
    });
  }

  /**
   * Submit Session: ACTIVE -> SUBMITTED (Terminal)
   */
  public async submitSession(params: {
    sessionId: string;
    tenantId: string;
    transitionRequestId: string;
    candidateId: string;
    reason?: string;
  }): Promise<SessionTransitionResult> {
    return this.executeTransition({
      sessionId: params.sessionId,
      tenantId: params.tenantId,
      transitionRequestId: params.transitionRequestId,
      targetState: 'SUBMITTED',
      expectedState: 'ACTIVE',
      actorType: 'CANDIDATE',
      actorId: params.candidateId,
      eventType: 'SESSION_SUBMITTED',
      receiptPayload: {
        submittedAt: new Date().toISOString(),
        reason: params.reason || 'Candidate explicit submission',
      },
      applyMutations: (_session, nowIso) => ({
        submittedAt: nowIso,
      }),
    });
  }

  /**
   * Expire Session: ACTIVE or RECOVERY_PENDING -> EXPIRED (Terminal)
   */
  public async expireSession(params: {
    sessionId: string;
    tenantId: string;
    transitionRequestId: string;
    reason?: string;
  }): Promise<SessionTransitionResult> {
    return this.executeTransition({
      sessionId: params.sessionId,
      tenantId: params.tenantId,
      transitionRequestId: params.transitionRequestId,
      targetState: 'EXPIRED',
      expectedState: ['ACTIVE', 'RECOVERY_PENDING'],
      actorType: 'SYSTEM',
      actorId: 'SERVER_TIMER',
      eventType: 'SESSION_EXPIRED',
      receiptPayload: {
        expiredAt: new Date().toISOString(),
        reason: params.reason || 'Server timer countdown reached 0:00',
      },
      applyMutations: (_session, nowIso) => ({
        expiredAt: nowIso,
      }),
    });
  }

  /**
   * Terminate Session: INITIALIZED or ACTIVE or PAUSED -> TERMINATED (Terminal)
   */
  public async terminateSession(params: {
    sessionId: string;
    tenantId: string;
    transitionRequestId: string;
    proctorId: string;
    reason: string;
  }): Promise<SessionTransitionResult> {
    return this.executeTransition({
      sessionId: params.sessionId,
      tenantId: params.tenantId,
      transitionRequestId: params.transitionRequestId,
      targetState: 'TERMINATED',
      expectedState: ['INITIALIZED', 'ACTIVE', 'PAUSED'],
      actorType: 'PROCTOR',
      actorId: params.proctorId,
      eventType: 'SESSION_TERMINATED',
      receiptPayload: {
        terminatedAt: new Date().toISOString(),
        proctorId: params.proctorId,
        reason: params.reason,
      },
      applyMutations: (_session, nowIso) => ({
        terminatedAt: nowIso,
      }),
    });
  }

  /**
   * Pause Session: ACTIVE -> PAUSED
   */
  public async pauseSession(params: {
    sessionId: string;
    tenantId: string;
    transitionRequestId: string;
    proctorId: string;
    reason: string;
  }): Promise<SessionTransitionResult> {
    return this.adapter.withTransaction(params.tenantId, async (client) => {
      const session = await this.fetchSessionForUpdate(client, params.sessionId);
      if (session.pauseCount >= this.maxAllowedPauses) {
        throw new SessionPauseLimitExceededError(
          params.sessionId,
          session.pauseCount,
          this.maxAllowedPauses
        );
      }

      return this.executeTransitionWithClient(client, {
        session,
        tenantId: params.tenantId,
        transitionRequestId: params.transitionRequestId,
        targetState: 'PAUSED',
        expectedState: 'ACTIVE',
        actorType: 'PROCTOR',
        actorId: params.proctorId,
        eventType: 'SESSION_PAUSED',
        receiptPayload: {
          pausedAt: new Date().toISOString(),
          reason: params.reason,
          pauseSequence: session.pauseCount + 1,
        },
        applyMutations: (_s, nowIso) => ({
          sessionConfiguration: {
            ...session.sessionConfiguration,
            lastPausedAt: nowIso,
          },
        }),
      });
    });
  }

  /**
   * Resume Session: PAUSED -> ACTIVE
   */
  public async resumeSession(params: {
    sessionId: string;
    tenantId: string;
    transitionRequestId: string;
    proctorId: string;
    leaseId: string;
  }): Promise<SessionTransitionResult> {
    return this.adapter.withTransaction(params.tenantId, async (client) => {
      const session = await this.fetchSessionForUpdate(client, params.sessionId);
      const lastPausedAtStr = session.sessionConfiguration?.lastPausedAt as string | undefined;
      const now = Date.now();
      let pauseDurationSeconds = 0;
      if (lastPausedAtStr) {
        const pauseStart = new Date(lastPausedAtStr).getTime();
        pauseDurationSeconds = Math.max(0, Math.floor((now - pauseStart) / 1000));
      }

      return this.executeTransitionWithClient(client, {
        session,
        tenantId: params.tenantId,
        transitionRequestId: params.transitionRequestId,
        targetState: 'ACTIVE',
        expectedState: 'PAUSED',
        actorType: 'PROCTOR',
        actorId: params.proctorId,
        eventType: 'SESSION_RESUMED',
        receiptPayload: {
          resumedAt: new Date(now).toISOString(),
          pauseDurationSeconds,
          newAccumulatedPauseSeconds: session.accumulatedPauseSeconds + pauseDurationSeconds,
          newPauseCount: session.pauseCount + 1,
        },
        applyMutations: (s, nowIso) => ({
          accumulatedPauseSeconds: s.accumulatedPauseSeconds + pauseDurationSeconds,
          pauseCount: s.pauseCount + 1,
          currentLeaseId: params.leaseId,
          leaseHeartbeatAt: nowIso,
        }),
      });
    });
  }

  /**
   * Heartbeat Renewal & Timeout Auto-Expiry
   */
  public async heartbeat(params: {
    sessionId: string;
    tenantId: string;
    leaseId: string;
  }): Promise<HeartbeatResult> {
    return this.adapter.withTransaction(params.tenantId, async (client) => {
      const session = await this.fetchSessionForUpdate(client, params.sessionId);

      // Terminal check
      if (session.sessionState === 'SUBMITTED') {
        throw new SessionAlreadySubmittedError(params.sessionId);
      }
      if (session.sessionState === 'EXPIRED') {
        throw new SessionExpiredError(params.sessionId);
      }
      if (session.sessionState === 'TERMINATED') {
        throw new SessionTerminatedError(params.sessionId);
      }

      // Lease check
      if (session.currentLeaseId !== params.leaseId) {
        throw new SessionLeaseMismatchError(
          params.sessionId,
          session.currentLeaseId,
          params.leaseId
        );
      }

      const timerStatus = this.calculateTimer(session);

      // Auto-expire if timer depleted
      if (timerStatus.remainingSeconds <= 0 && session.sessionState === 'ACTIVE') {
        await this.expireSession({
          sessionId: params.sessionId,
          tenantId: params.tenantId,
          transitionRequestId: `auto_expire_${params.sessionId}_${Date.now()}`,
          reason: 'Heartbeat observed timer expiration',
        });
        return {
          examSessionId: params.sessionId,
          leaseId: params.leaseId,
          leaseHeartbeatAt: new Date().toISOString(),
          remainingSeconds: 0,
          sessionState: 'EXPIRED',
        };
      }

      // Update heartbeat timestamp
      const nowIso = new Date().toISOString();
      await client.query(
        `UPDATE public.exam_sessions 
         SET lease_heartbeat_at = $1, updated_at = $1 
         WHERE exam_session_id = $2`,
        [nowIso, params.sessionId]
      );

      return {
        examSessionId: params.sessionId,
        leaseId: params.leaseId,
        leaseHeartbeatAt: nowIso,
        remainingSeconds: timerStatus.remainingSeconds,
        sessionState: session.sessionState,
      };
    });
  }

  /**
   * Detect Lost Heartbeat: ACTIVE -> RECOVERY_PENDING
   */
  public async detectHeartbeatTimeout(params: {
    sessionId: string;
    tenantId: string;
    timeoutSeconds?: number;
  }): Promise<SessionTransitionResult | null> {
    const timeoutThreshold = params.timeoutSeconds ?? this.heartbeatTimeoutSeconds;

    return this.adapter.withTransaction(params.tenantId, async (client) => {
      const session = await this.fetchSessionForUpdate(client, params.sessionId);
      if (session.sessionState !== 'ACTIVE') return null;

      const lastHeartbeat = new Date(session.leaseHeartbeatAt).getTime();
      const elapsedSeconds = Math.floor((Date.now() - lastHeartbeat) / 1000);

      if (elapsedSeconds < timeoutThreshold) return null;

      return this.executeTransitionWithClient(client, {
        session,
        tenantId: params.tenantId,
        transitionRequestId: `heartbeat_lost_${params.sessionId}_${Date.now()}`,
        targetState: 'RECOVERY_PENDING',
        expectedState: 'ACTIVE',
        actorType: 'SYSTEM',
        actorId: 'WATCHDOG',
        eventType: 'HEARTBEAT_LOST',
        receiptPayload: {
          lastHeartbeatAt: session.leaseHeartbeatAt,
          elapsedSecondsSinceHeartbeat: elapsedSeconds,
          timeoutThreshold,
        },
        applyMutations: () => ({}),
      });
    });
  }

  /**
   * Reconnect Session: RECOVERY_PENDING -> ACTIVE
   */
  public async reconnectSession(params: {
    sessionId: string;
    tenantId: string;
    transitionRequestId: string;
    newLeaseId: string;
    candidateId: string;
    maxGraceSeconds?: number;
  }): Promise<SessionTransitionResult> {
    const maxGrace = params.maxGraceSeconds ?? this.maxRecoveryGraceSeconds;

    return this.adapter.withTransaction(params.tenantId, async (client) => {
      const session = await this.fetchSessionForUpdate(client, params.sessionId);
      if (session.sessionState !== 'RECOVERY_PENDING') {
        throw new SessionIllegalStateTransitionError(
          params.sessionId,
          session.sessionState,
          'ACTIVE',
          `Cannot reconnect session in state ${session.sessionState}; must be in RECOVERY_PENDING.`
        );
      }

      const lastHeartbeat = new Date(session.leaseHeartbeatAt).getTime();
      const elapsedSeconds = Math.floor((Date.now() - lastHeartbeat) / 1000);

      if (elapsedSeconds > maxGrace) {
        throw new SessionGracePeriodExceededError(params.sessionId, elapsedSeconds, maxGrace);
      }

      return this.executeTransitionWithClient(client, {
        session,
        tenantId: params.tenantId,
        transitionRequestId: params.transitionRequestId,
        targetState: 'ACTIVE',
        expectedState: 'RECOVERY_PENDING',
        actorType: 'CANDIDATE',
        actorId: params.candidateId,
        eventType: 'SESSION_RECONNECTED',
        receiptPayload: {
          previousLeaseId: session.currentLeaseId,
          newLeaseId: params.newLeaseId,
          reconnectDelaySeconds: elapsedSeconds,
        },
        applyMutations: (_s, nowIso) => ({
          currentLeaseId: params.newLeaseId,
          leaseHeartbeatAt: nowIso,
        }),
      });
    });
  }

  /**
   * Server-authoritative timer countdown and receipt grace status (R2-01 / R3-05)
   */
  public async getTimerStatus(params: {
    sessionId: string;
    tenantId: string;
    receiptTimestamp?: string;
  }): Promise<SessionTimerStatus> {
    const session = await this.adapter.getExamSession(params.sessionId, params.tenantId);
    if (!session) {
      throw new SessionNotFoundError(params.sessionId);
    }
    return this.calculateTimer(session, params.receiptTimestamp);
  }

  /**
   * Internal pure calculation of timer status and grace cutoff
   */
  public calculateTimer(
    session: ExamSessionRecord,
    receiptTimestamp?: string
  ): SessionTimerStatus {
    const now = Date.now();
    const serverNowIso = new Date(now).toISOString();

    if (!session.actualStartedAt) {
      return {
        serverNow: serverNowIso,
        actualStartedAt: null,
        durationSeconds: session.durationSeconds,
        accumulatedPauseSeconds: session.accumulatedPauseSeconds,
        elapsedSeconds: 0,
        remainingSeconds: session.durationSeconds,
        deadlineAt: null,
        receiptGraceCutoffAt: null,
        isExpired: false,
        isWithinGracePeriod: true,
      };
    }

    const startMs = new Date(session.actualStartedAt).getTime();
    const totalAllowedMs = (session.durationSeconds + session.accumulatedPauseSeconds) * 1000;
    const deadlineMs = startMs + totalAllowedMs;
    const graceCutoffMs = deadlineMs + this.transportGraceSeconds * 1000;

    const deadlineIso = new Date(deadlineMs).toISOString();
    const graceCutoffIso = new Date(graceCutoffMs).toISOString();

    const elapsedMs = Math.max(0, now - startMs - session.accumulatedPauseSeconds * 1000);
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    const remainingSeconds = Math.max(0, Math.ceil((deadlineMs - now) / 1000));
    const isExpired = remainingSeconds <= 0 || session.sessionState === 'EXPIRED';

    // Receipt grace verification: T_receipt <= T_deadline + 15.000s
    const evalTimestampMs = receiptTimestamp ? new Date(receiptTimestamp).getTime() : now;
    const isWithinGracePeriod = evalTimestampMs <= graceCutoffMs;

    return {
      serverNow: serverNowIso,
      actualStartedAt: session.actualStartedAt,
      durationSeconds: session.durationSeconds,
      accumulatedPauseSeconds: session.accumulatedPauseSeconds,
      elapsedSeconds,
      remainingSeconds,
      deadlineAt: deadlineIso,
      receiptGraceCutoffAt: graceCutoffIso,
      isExpired,
      isWithinGracePeriod,
    };
  }

  // ==========================================================================
  // Private Atomic Orchestration Helpers
  // ==========================================================================

  private async executeTransition(params: {
    sessionId: string;
    tenantId: string;
    transitionRequestId: string;
    targetState: ExamSessionState;
    expectedState: ExamSessionState | ExamSessionState[];
    actorType: 'CANDIDATE' | 'PROCTOR' | 'STAFF' | 'SYSTEM';
    actorId: string;
    eventType: string;
    receiptPayload: Record<string, unknown>;
    applyMutations: (
      session: ExamSessionRecord,
      nowIso: string
    ) => Partial<ExamSessionRecord>;
  }): Promise<SessionTransitionResult> {
    return this.adapter.withTransaction(params.tenantId, async (client) => {
      // 1. Check idempotency: Return existing receipt if (session_id, request_id) already committed
      const existingTx = await client.query(
        `SELECT * FROM public.exam_session_transitions 
         WHERE exam_session_id = $1 AND transition_request_id = $2`,
        [params.sessionId, params.transitionRequestId]
      );
      if (existingTx.rows.length > 0) {
        const row = existingTx.rows[0];
        return {
          transitionId: row.transition_id,
          examSessionId: row.exam_session_id,
          fromState: row.from_state,
          toState: row.to_state,
          fromVersion: row.from_version,
          toVersion: row.to_version,
          idempotentReplay: true,
          receipt: row.transition_receipt,
        };
      }

      // 2. Fetch and row-lock the session
      const session = await this.fetchSessionForUpdate(client, params.sessionId);

      return this.executeTransitionWithClient(client, {
        session,
        tenantId: params.tenantId,
        transitionRequestId: params.transitionRequestId,
        targetState: params.targetState,
        expectedState: params.expectedState,
        actorType: params.actorType,
        actorId: params.actorId,
        eventType: params.eventType,
        receiptPayload: params.receiptPayload,
        applyMutations: params.applyMutations,
      });
    });
  }

  private async executeTransitionWithClient(
    client: PoolClient,
    params: {
      session: ExamSessionRecord;
      tenantId: string;
      transitionRequestId: string;
      targetState: ExamSessionState;
      expectedState: ExamSessionState | ExamSessionState[];
      actorType: 'CANDIDATE' | 'PROCTOR' | 'STAFF' | 'SYSTEM';
      actorId: string;
      eventType: string;
      receiptPayload: Record<string, unknown>;
      applyMutations: (
        session: ExamSessionRecord,
        nowIso: string
      ) => Partial<ExamSessionRecord>;
    }
  ): Promise<SessionTransitionResult> {
    const { session, targetState, expectedState } = params;

    // 1. Validate FSM transition
    this.validateTransition(session.examSessionId, session.sessionState, targetState);

    // 2. Validate expected state precondition
    const allowedExpected = Array.isArray(expectedState) ? expectedState : [expectedState];
    if (!allowedExpected.includes(session.sessionState)) {
      throw new SessionIllegalStateTransitionError(
        session.examSessionId,
        session.sessionState,
        targetState,
        `Expected state to be one of [${allowedExpected.join(', ')}], but was ${session.sessionState}`
      );
    }

    const nowIso = new Date().toISOString();
    const newVersion = session.stateVersion + 1;
    const mutations = params.applyMutations(session, nowIso);

    // 3. Optimistic Update (state_version gating)
    const updateRes = await client.query(
      `UPDATE public.exam_sessions SET
        session_state = $1,
        state_version = $2,
        actual_started_at = COALESCE($3, actual_started_at),
        current_lease_id = COALESCE($4, current_lease_id),
        lease_heartbeat_at = COALESCE($5, lease_heartbeat_at),
        accumulated_pause_seconds = COALESCE($6, accumulated_pause_seconds),
        pause_count = COALESCE($7, pause_count),
        submitted_at = COALESCE($8, submitted_at),
        expired_at = COALESCE($9, expired_at),
        terminated_at = COALESCE($10, terminated_at),
        session_configuration = COALESCE($11, session_configuration),
        updated_at = $12
      WHERE exam_session_id = $13 
        AND session_state = $14 
        AND state_version = $15`,
      [
        targetState,
        newVersion,
        mutations.actualStartedAt ?? null,
        mutations.currentLeaseId ?? null,
        mutations.leaseHeartbeatAt ?? null,
        mutations.accumulatedPauseSeconds ?? null,
        mutations.pauseCount ?? null,
        mutations.submittedAt ?? null,
        mutations.expiredAt ?? null,
        mutations.terminatedAt ?? null,
        mutations.sessionConfiguration ? JSON.stringify(mutations.sessionConfiguration) : null,
        nowIso,
        session.examSessionId,
        session.sessionState,
        session.stateVersion,
      ]
    );

    if (updateRes.rowCount === 0) {
      // Race condition detected! Another transaction updated the state version.
      const current = await this.fetchSessionForUpdate(client, session.examSessionId);
      throw new SessionConcurrencyConflictError(
        session.examSessionId,
        session.stateVersion,
        current.stateVersion
      );
    }

    // 4. Generate transition receipt and hash
    const transitionId = `tr_${session.examSessionId}_v${newVersion}`;
    const idempotencyHash = createHash('sha256')
      .update(`${session.examSessionId}:${params.transitionRequestId}:${newVersion}:${targetState}`)
      .digest('hex');

    const transitionRecord: ExamSessionTransitionRecord = {
      transitionId,
      examSessionId: session.examSessionId,
      tenantId: params.tenantId,
      transitionRequestId: params.transitionRequestId,
      fromState: session.sessionState,
      toState: targetState,
      fromVersion: session.stateVersion,
      toVersion: newVersion,
      idempotencyHash,
      transitionReceipt: params.receiptPayload,
      recordedAt: nowIso,
    };

    // 5. Append row to exam_session_transitions ledger
    await client.query(
      `INSERT INTO public.exam_session_transitions (
        transition_id, exam_session_id, tenant_id, transition_request_id,
        from_state, to_state, from_version, to_version,
        idempotency_hash, transition_receipt, recorded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        transitionRecord.transitionId,
        transitionRecord.examSessionId,
        transitionRecord.tenantId,
        transitionRecord.transitionRequestId,
        transitionRecord.fromState,
        transitionRecord.toState,
        transitionRecord.fromVersion,
        transitionRecord.toVersion,
        transitionRecord.idempotencyHash,
        JSON.stringify(transitionRecord.transitionReceipt),
        transitionRecord.recordedAt,
      ]
    );

    // 6. Record security audit event
    const auditRecord: AuditEventRecord = {
      auditEventId: `audit_tx_${transitionId}`,
      tenantId: params.tenantId,
      eventType: params.eventType,
      severity: targetState === 'TERMINATED' ? 'CRITICAL' : 'INFO',
      actorType: params.actorType,
      actorId: params.actorId,
      resourceType: 'EXAM_SESSION',
      resourceId: session.examSessionId,
      eventPayload: {
        fromState: session.sessionState,
        toState: targetState,
        fromVersion: session.stateVersion,
        toVersion: newVersion,
        transitionRequestId: params.transitionRequestId,
        ...params.receiptPayload,
      },
      recordedAt: nowIso,
    };

    await client.query(
      `INSERT INTO public.audit_events (
        audit_event_id, tenant_id, event_type, severity,
        actor_type, actor_id, resource_type, resource_id,
        event_payload, recorded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        auditRecord.auditEventId,
        auditRecord.tenantId,
        auditRecord.eventType,
        auditRecord.severity,
        auditRecord.actorType,
        auditRecord.actorId,
        auditRecord.resourceType,
        auditRecord.resourceId,
        JSON.stringify(auditRecord.eventPayload),
        auditRecord.recordedAt,
      ]
    );

    return {
      transitionId,
      examSessionId: session.examSessionId,
      fromState: session.sessionState,
      toState: targetState,
      fromVersion: session.stateVersion,
      toVersion: newVersion,
      idempotentReplay: false,
      receipt: params.receiptPayload,
    };
  }

  private async fetchSessionForUpdate(
    client: PoolClient,
    sessionId: string
  ): Promise<ExamSessionRecord> {
    const res = await client.query(
      `SELECT * FROM public.exam_sessions WHERE exam_session_id = $1 FOR UPDATE`,
      [sessionId]
    );
    if (res.rows.length === 0) {
      throw new SessionNotFoundError(sessionId);
    }
    const r = res.rows[0];
    return {
      examSessionId: r.exam_session_id,
      tenantId: r.tenant_id,
      candidateId: r.candidate_id,
      packageId: r.package_id,
      packageIntegritySeal: r.package_integrity_seal,
      sessionConfiguration: r.session_configuration,
      sessionState: r.session_state,
      stateVersion: r.state_version,
      currentLeaseId: r.current_lease_id,
      leaseHeartbeatAt: r.lease_heartbeat_at.toISOString(),
      scheduledStartAt: r.scheduled_start_at.toISOString(),
      actualStartedAt: r.actual_started_at ? r.actual_started_at.toISOString() : null,
      durationSeconds: r.duration_seconds,
      accumulatedPauseSeconds: r.accumulated_pause_seconds,
      pauseCount: r.pause_count,
      submittedAt: r.submitted_at ? r.submitted_at.toISOString() : null,
      expiredAt: r.expired_at ? r.expired_at.toISOString() : null,
      terminatedAt: r.terminated_at ? r.terminated_at.toISOString() : null,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    };
  }
}
