/**
 * UADUE Phase 3.2 — Session Orchestration Engine Integration & Invariant Suite
 * Specification: UADUE-P3-HARD-R3-001 (R3 Final Hardened Contract)
 * FSM Model: UADUE-P3-FSM-004
 *
 * Verifies against REAL PostgreSQL database (mockai_uadue_test):
 * 1. Complete FSM Lifecycle (INITIALIZED -> ACTIVE -> PAUSED -> ACTIVE -> SUBMITTED)
 * 2. Terminal State Invariants (SUBMITTED, EXPIRED, TERMINATED strictly forbid further transitions)
 * 3. Heartbeat Expiry Detection & Candidate Reconnection (ACTIVE -> RECOVERY_PENDING -> ACTIVE)
 * 4. Optimistic Concurrency Control (P3-I21 race condition prevention)
 * 5. Request Idempotency on (exam_session_id, transition_request_id)
 * 6. Pause Limit Enforcement (maxAllowedPauses)
 * 7. Server-Authoritative Timer & 15.000s Transport Grace Period (R2-01 / R3-05)
 * 8. Relational Transition Ledger & Security Audit Trail Durability
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { DeliveryPostgresAdapter } from './deliveryPostgresAdapter';
import {
  SessionOrchestrator,
  SessionAlreadySubmittedError,
  SessionExpiredError,
  SessionTerminatedError,
  SessionIllegalStateTransitionError,
  SessionConcurrencyConflictError,
  SessionLeaseMismatchError,
  SessionPauseLimitExceededError,
  SessionGracePeriodExceededError,
} from './sessionOrchestrator';
import { ExamSessionRecord } from './deliveryTypes';

describe('UADUE Phase 3.2 — Session Orchestration Invariant Suite', () => {
  let pool: Pool;
  let adapter: DeliveryPostgresAdapter;
  let orchestrator: SessionOrchestrator;

  const TEST_PACKAGE_ID = 'pkg_uadue_phase3_test_001';
  const TEST_SEAL = 'seal_uadue_phase3_sha256_mock_valid_seal';
  const TENANT_ID = 'tenant_orch_test';

  beforeAll(async () => {
    pool = new Pool({
      host: 'localhost',
      port: 5432,
      database: 'mockai_uadue_test',
      user: process.env.USER || 'postgres',
      max: 10,
    });
    adapter = new DeliveryPostgresAdapter({
      host: 'localhost',
      port: 5432,
      database: 'mockai_uadue_test',
      user: process.env.USER || 'postgres',
    });
    orchestrator = new SessionOrchestrator(adapter, {
      heartbeatTimeoutSeconds: 5,
      maxRecoveryGraceSeconds: 10,
      maxAllowedPauses: 2,
      transportGraceSeconds: 15.0,
    });

    // Ensure seed canonical package exists in Phase 2
    const client = await pool.connect();
    try {
      await client.query("SELECT set_config('app.is_service_role', 'true', true)");
      await client.query(
        `INSERT INTO public.canonical_assessment_packages (
          package_id, source_snapshot_id, source_document_id, package_integrity_seal,
          schema_version, pipeline_algorithm_id, pipeline_algorithm_version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (package_id) DO NOTHING`,
        [
          TEST_PACKAGE_ID,
          'snap_p3_001',
          'doc_p3_001',
          TEST_SEAL,
          '1.0.0',
          'UADUE_CANONICAL_V4',
          '4.0.0',
        ]
      );
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await adapter.close();
    await pool.end();
  });

  beforeEach(async () => {
    const client = await pool.connect();
    try {
      await client.query("SELECT set_config('app.is_service_role', 'true', true)");
      await client.query('TRUNCATE TABLE public.exam_sessions, public.audit_events CASCADE');
    } finally {
      client.release();
    }
  });

  const createInitialSession = async (
    sessionId: string,
    overrides: Partial<ExamSessionRecord> = {}
  ): Promise<ExamSessionRecord> => {
    const session: ExamSessionRecord = {
      examSessionId: sessionId,
      tenantId: TENANT_ID,
      candidateId: 'cand_orch_001',
      packageId: TEST_PACKAGE_ID,
      packageIntegritySeal: TEST_SEAL,
      sessionConfiguration: {},
      sessionState: 'INITIALIZED',
      stateVersion: 1,
      currentLeaseId: 'lease_init',
      leaseHeartbeatAt: new Date().toISOString(),
      scheduledStartAt: new Date().toISOString(),
      actualStartedAt: null,
      durationSeconds: 3600,
      accumulatedPauseSeconds: 0,
      pauseCount: 0,
      submittedAt: null,
      expiredAt: null,
      terminatedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    };
    await adapter.createExamSession(session);
    return session;
  };

  // ==========================================================================
  // Invariant 1: Complete FSM Lifecycle & Terminal State Enforcement
  // ==========================================================================
  it('FSM-1: Full lifecycle (INITIALIZED -> ACTIVE -> PAUSED -> ACTIVE -> SUBMITTED) with terminal lock', async () => {
    const sessionId = 'sess_fsm_lifecycle';
    await createInitialSession(sessionId);

    // 1. INITIALIZED -> ACTIVE
    const startResult = await orchestrator.startSession({
      sessionId,
      tenantId: TENANT_ID,
      transitionRequestId: 'req_start_1',
      leaseId: 'lease_active_1',
      candidateId: 'cand_orch_001',
    });
    expect(startResult.fromState).toBe('INITIALIZED');
    expect(startResult.toState).toBe('ACTIVE');
    expect(startResult.fromVersion).toBe(1);
    expect(startResult.toVersion).toBe(2);
    expect(startResult.idempotentReplay).toBe(false);

    // 2. ACTIVE -> PAUSED
    const pauseResult = await orchestrator.pauseSession({
      sessionId,
      tenantId: TENANT_ID,
      transitionRequestId: 'req_pause_1',
      proctorId: 'proctor_001',
      reason: 'Hardware issue resolved by proctor',
    });
    expect(pauseResult.fromState).toBe('ACTIVE');
    expect(pauseResult.toState).toBe('PAUSED');
    expect(pauseResult.toVersion).toBe(3);

    // 3. PAUSED -> ACTIVE (Resume)
    const resumeResult = await orchestrator.resumeSession({
      sessionId,
      tenantId: TENANT_ID,
      transitionRequestId: 'req_resume_1',
      proctorId: 'proctor_001',
      leaseId: 'lease_active_2',
    });
    expect(resumeResult.fromState).toBe('PAUSED');
    expect(resumeResult.toState).toBe('ACTIVE');
    expect(resumeResult.toVersion).toBe(4);

    // 4. ACTIVE -> SUBMITTED (Terminal)
    const submitResult = await orchestrator.submitSession({
      sessionId,
      tenantId: TENANT_ID,
      transitionRequestId: 'req_submit_1',
      candidateId: 'cand_orch_001',
    });
    expect(submitResult.fromState).toBe('ACTIVE');
    expect(submitResult.toState).toBe('SUBMITTED');
    expect(submitResult.toVersion).toBe(5);

    // 5. Terminal State Lock: Any further transition attempt MUST fail with SessionAlreadySubmittedError
    await expect(
      orchestrator.pauseSession({
        sessionId,
        tenantId: TENANT_ID,
        transitionRequestId: 'req_pause_after_sub',
        proctorId: 'proctor_001',
        reason: 'Illegal pause',
      })
    ).rejects.toThrow(SessionAlreadySubmittedError);

    await expect(
      orchestrator.submitSession({
        sessionId,
        tenantId: TENANT_ID,
        transitionRequestId: 'req_submit_after_sub',
        candidateId: 'cand_orch_001',
      })
    ).rejects.toThrow(SessionAlreadySubmittedError);
  });

  // ==========================================================================
  // Invariant 2: Terminal EXPIRED State & Heartbeat Auto-Expiry
  // ==========================================================================
  it('FSM-2: Session expiration locks terminal state and rejects subsequent actions', async () => {
    const sessionId = 'sess_fsm_expiry';
    await createInitialSession(sessionId, { durationSeconds: 60 });

    await orchestrator.startSession({
      sessionId,
      tenantId: TENANT_ID,
      transitionRequestId: 'req_start_exp',
      leaseId: 'lease_exp_1',
      candidateId: 'cand_orch_001',
    });

    // Explicit timer expiration
    const expResult = await orchestrator.expireSession({
      sessionId,
      tenantId: TENANT_ID,
      transitionRequestId: 'req_expire_1',
      reason: 'Server time elapsed',
    });
    expect(expResult.fromState).toBe('ACTIVE');
    expect(expResult.toState).toBe('EXPIRED');

    // Terminal verification
    await expect(
      orchestrator.submitSession({
        sessionId,
        tenantId: TENANT_ID,
        transitionRequestId: 'req_sub_after_exp',
        candidateId: 'cand_orch_001',
      })
    ).rejects.toThrow(SessionExpiredError);

    await expect(
      orchestrator.heartbeat({
        sessionId,
        tenantId: TENANT_ID,
        leaseId: 'lease_exp_1',
      })
    ).rejects.toThrow(SessionExpiredError);
  });

  // ==========================================================================
  // Invariant 3: Terminal TERMINATED State
  // ==========================================================================
  it('FSM-3: Proctor termination locks terminal state and rejects subsequent actions', async () => {
    const sessionId = 'sess_fsm_terminated';
    await createInitialSession(sessionId);

    await orchestrator.startSession({
      sessionId,
      tenantId: TENANT_ID,
      transitionRequestId: 'req_start_term',
      leaseId: 'lease_term_1',
      candidateId: 'cand_orch_001',
    });

    const termResult = await orchestrator.terminateSession({
      sessionId,
      tenantId: TENANT_ID,
      transitionRequestId: 'req_terminate_1',
      proctorId: 'proctor_security_officer',
      reason: 'Candidate unauthorized materials detected',
    });
    expect(termResult.fromState).toBe('ACTIVE');
    expect(termResult.toState).toBe('TERMINATED');

    await expect(
      orchestrator.submitSession({
        sessionId,
        tenantId: TENANT_ID,
        transitionRequestId: 'req_sub_after_term',
        candidateId: 'cand_orch_001',
      })
    ).rejects.toThrow(SessionTerminatedError);
  });

  // ==========================================================================
  // Invariant 4: Heartbeat Disconnect & Reconnection Recovery Flow
  // ==========================================================================
  it('FSM-4: Heartbeat lost triggers RECOVERY_PENDING, candidate reconnects within grace period', async () => {
    const sessionId = 'sess_recovery_reconnect';
    await createInitialSession(sessionId);

    await orchestrator.startSession({
      sessionId,
      tenantId: TENANT_ID,
      transitionRequestId: 'req_start_rec',
      leaseId: 'lease_rec_1',
      candidateId: 'cand_orch_001',
    });

    // Simulate stale heartbeat in database (6 seconds ago > timeout 5s)
    const client = await pool.connect();
    try {
      await client.query("SELECT set_config('app.is_service_role', 'true', true)");
      const staleTime = new Date(Date.now() - 6000).toISOString();
      await client.query(
        'UPDATE public.exam_sessions SET lease_heartbeat_at = $1 WHERE exam_session_id = $2',
        [staleTime, sessionId]
      );
    } finally {
      client.release();
    }

    // Detect timeout -> Transitions to RECOVERY_PENDING
    const lostResult = await orchestrator.detectHeartbeatTimeout({
      sessionId,
      tenantId: TENANT_ID,
      timeoutSeconds: 5,
    });
    expect(lostResult).not.toBeNull();
    expect(lostResult?.toState).toBe('RECOVERY_PENDING');

    // Candidate reconnects within grace window (e.g. 2s since lost)
    const reconnectResult = await orchestrator.reconnectSession({
      sessionId,
      tenantId: TENANT_ID,
      transitionRequestId: 'req_reconnect_1',
      newLeaseId: 'lease_rec_2',
      candidateId: 'cand_orch_001',
      maxGraceSeconds: 15,
    });
    expect(reconnectResult.fromState).toBe('RECOVERY_PENDING');
    expect(reconnectResult.toState).toBe('ACTIVE');

    // Verify session updated with new lease
    const session = await adapter.getExamSession(sessionId, TENANT_ID);
    expect(session?.sessionState).toBe('ACTIVE');
    expect(session?.currentLeaseId).toBe('lease_rec_2');
  });

  // ==========================================================================
  // Invariant 5: Optimistic Concurrency Control (P3-I21 Single-Writer Protocol)
  // ==========================================================================
  it('FSM-5: P3-I21: Concurrent conflicting transitions on the same state version trigger conflict', async () => {
    const sessionId = 'sess_concurrency_race';
    await createInitialSession(sessionId);

    await orchestrator.startSession({
      sessionId,
      tenantId: TENANT_ID,
      transitionRequestId: 'req_start_race',
      leaseId: 'lease_race_1',
      candidateId: 'cand_orch_001',
    });

    // Two racing requests attempting to transition from ACTIVE (state_version = 2) simultaneously:
    // Request A: Candidate SUBMIT
    // Request B: Proctor PAUSE
    const promiseA = orchestrator.submitSession({
      sessionId,
      tenantId: TENANT_ID,
      transitionRequestId: 'req_race_submit',
      candidateId: 'cand_orch_001',
    });

    const promiseB = orchestrator.pauseSession({
      sessionId,
      tenantId: TENANT_ID,
      transitionRequestId: 'req_race_pause',
      proctorId: 'proctor_001',
      reason: 'Race test pause',
    });

    // One must succeed, the other must fail with SessionAlreadySubmittedError or SessionConcurrencyConflictError
    const results = await Promise.allSettled([promiseA, promiseB]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    // The rejected request must be a conflict error or terminal lock
    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(
      rejectionReason instanceof SessionConcurrencyConflictError ||
        rejectionReason instanceof SessionAlreadySubmittedError ||
        rejectionReason instanceof SessionIllegalStateTransitionError
    ).toBe(true);
  });

  // ==========================================================================
  // Invariant 6: Transition Request Idempotency
  // ==========================================================================
  it('FSM-6: Replaying identical transition_request_id returns existing receipt idempotently', async () => {
    const sessionId = 'sess_idemp_tx';
    await createInitialSession(sessionId);

    const firstRun = await orchestrator.startSession({
      sessionId,
      tenantId: TENANT_ID,
      transitionRequestId: 'req_idemp_key_001',
      leaseId: 'lease_idemp_1',
      candidateId: 'cand_orch_001',
    });
    expect(firstRun.idempotentReplay).toBe(false);
    expect(firstRun.toVersion).toBe(2);

    // Second call with identical transitionRequestId
    const secondRun = await orchestrator.startSession({
      sessionId,
      tenantId: TENANT_ID,
      transitionRequestId: 'req_idemp_key_001',
      leaseId: 'lease_idemp_1',
      candidateId: 'cand_orch_001',
    });
    expect(secondRun.idempotentReplay).toBe(true);
    expect(secondRun.transitionId).toBe(firstRun.transitionId);
    expect(secondRun.toVersion).toBe(firstRun.toVersion);

    // Confirm that only 1 transition row exists in PostgreSQL
    const client = await pool.connect();
    try {
      const txCount = await client.query(
        'SELECT COUNT(*) FROM public.exam_session_transitions WHERE exam_session_id = $1',
        [sessionId]
      );
      expect(Number(txCount.rows[0].count)).toBe(1);
    } finally {
      client.release();
    }
  });

  // ==========================================================================
  // Invariant 7: Pause Limit Enforcement
  // ==========================================================================
  it('FSM-7: Exceeding maxAllowedPauses (2) throws SessionPauseLimitExceededError', async () => {
    const sessionId = 'sess_pause_limit';
    await createInitialSession(sessionId);

    await orchestrator.startSession({
      sessionId,
      tenantId: TENANT_ID,
      transitionRequestId: 'req_start_p_lim',
      leaseId: 'lease_p_lim',
      candidateId: 'cand_orch_001',
    });

    // Pause 1 & Resume 1
    await orchestrator.pauseSession({
      sessionId,
      tenantId: TENANT_ID,
      transitionRequestId: 'req_p1',
      proctorId: 'proc_1',
      reason: 'Pause 1',
    });
    await orchestrator.resumeSession({
      sessionId,
      tenantId: TENANT_ID,
      transitionRequestId: 'req_r1',
      proctorId: 'proc_1',
      leaseId: 'lease_p_lim',
    });

    // Pause 2 & Resume 2
    await orchestrator.pauseSession({
      sessionId,
      tenantId: TENANT_ID,
      transitionRequestId: 'req_p2',
      proctorId: 'proc_1',
      reason: 'Pause 2',
    });
    await orchestrator.resumeSession({
      sessionId,
      tenantId: TENANT_ID,
      transitionRequestId: 'req_r2',
      proctorId: 'proc_1',
      leaseId: 'lease_p_lim',
    });

    // Attempt Pause 3 -> Exceeds maxAllowedPauses (2)
    await expect(
      orchestrator.pauseSession({
        sessionId,
        tenantId: TENANT_ID,
        transitionRequestId: 'req_p3',
        proctorId: 'proc_1',
        reason: 'Pause 3 (Exceeds limit)',
      })
    ).rejects.toThrow(SessionPauseLimitExceededError);
  });

  // ==========================================================================
  // Invariant 8: Server-Authoritative Timer & 15.000s Receipt Grace (R2-01 / R3-05)
  // ==========================================================================
  it('FSM-8: R2-01 / R3-05: Server timer computes authoritative deadline and 15.000s receipt grace', async () => {
    const sessionId = 'sess_timer_grace';
    const durationSeconds = 300; // 5 minutes
    const nowMs = Date.now();
    const actualStartedAt = new Date(nowMs - 100 * 1000).toISOString(); // Started 100s ago

    await createInitialSession(sessionId, {
      sessionState: 'ACTIVE',
      stateVersion: 2,
      durationSeconds,
      actualStartedAt,
      accumulatedPauseSeconds: 20, // 20s paused
    });

    // Expected deadline = start (now - 100s) + 300s duration + 20s pause = now + 220s
    const timerStatus = await orchestrator.getTimerStatus({
      sessionId,
      tenantId: TENANT_ID,
    });

    expect(timerStatus.durationSeconds).toBe(300);
    expect(timerStatus.accumulatedPauseSeconds).toBe(20);
    expect(timerStatus.elapsedSeconds).toBe(80); // 100 - 20 = 80s
    expect(timerStatus.remainingSeconds).toBe(220); // 300 - 80 = 220s
    expect(timerStatus.isExpired).toBe(false);

    // Deadline timestamp check
    const deadlineMs = new Date(timerStatus.deadlineAt!).getTime();
    const graceCutoffMs = new Date(timerStatus.receiptGraceCutoffAt!).getTime();
    expect(graceCutoffMs - deadlineMs).toBe(15000); // Exactly 15.000 seconds transport grace

    // Test receipt grace boundaries:
    // Packet received at deadline + 14.5s -> ACCEPTED
    const packetReceiptWithinGrace = new Date(deadlineMs + 14500).toISOString();
    const statusWithin = await orchestrator.getTimerStatus({
      sessionId,
      tenantId: TENANT_ID,
      receiptTimestamp: packetReceiptWithinGrace,
    });
    expect(statusWithin.isWithinGracePeriod).toBe(true);

    // Packet received at deadline + 15.5s -> REJECTED (exceeded 15.000s grace)
    const packetReceiptPastGrace = new Date(deadlineMs + 15500).toISOString();
    const statusPast = await orchestrator.getTimerStatus({
      sessionId,
      tenantId: TENANT_ID,
      receiptTimestamp: packetReceiptPastGrace,
    });
    expect(statusPast.isWithinGracePeriod).toBe(false);
  });

  // ==========================================================================
  // Invariant 9: Audit Trail & Transition Ledger Completeness
  // ==========================================================================
  it('FSM-9: Every state transition emits transition ledger entry and audit event', async () => {
    const sessionId = 'sess_audit_trail';
    await createInitialSession(sessionId);

    await orchestrator.startSession({
      sessionId,
      tenantId: TENANT_ID,
      transitionRequestId: 'req_audit_1',
      leaseId: 'lease_audit_1',
      candidateId: 'cand_audit_001',
    });

    await orchestrator.submitSession({
      sessionId,
      tenantId: TENANT_ID,
      transitionRequestId: 'req_audit_2',
      candidateId: 'cand_audit_001',
    });

    // Check transition ledger
    const client = await pool.connect();
    try {
      const transitions = await client.query(
        `SELECT * FROM public.exam_session_transitions 
         WHERE exam_session_id = $1 ORDER BY to_version ASC`,
        [sessionId]
      );
      expect(transitions.rows.length).toBe(2);
      expect(transitions.rows[0].to_state).toBe('ACTIVE');
      expect(transitions.rows[1].to_state).toBe('SUBMITTED');

      // Check audit events
      const audits = await adapter.getAuditEvents(TENANT_ID);
      const sessionAudits = audits.filter((a) => a.resourceId === sessionId);
      expect(sessionAudits.length).toBe(2);
      const eventTypes = sessionAudits.map((a) => a.eventType);
      expect(eventTypes).toContain('SESSION_STARTED');
      expect(eventTypes).toContain('SESSION_SUBMITTED');
    } finally {
      client.release();
    }
  });
});
