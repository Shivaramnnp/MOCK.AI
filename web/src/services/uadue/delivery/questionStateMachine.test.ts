/**
 * UADUE Phase 3.4 — Candidate Question State Machine Integration & Invariant Suite
 * Specification: UADUE-P3-HARD-R3-001 (R3 Final Hardened Contract)
 * FSM & Reducer Model: UADUE-P3-FSM-004
 *
 * Verifies against REAL PostgreSQL database (mockai_uadue_test):
 * 1. Single choice selection reduction into server-authoritative candidate_question_states
 * 2. Sequential revision chain (Select -> Switch -> Clear -> Re-select) with version tracking
 * 3. Multiple choice selection reduction with array payload
 * 4. Numerical value entry reduction with empty string detection
 * 5. Review flag toggle (MARK_FOR_REVIEW / UNMARK_FOR_REVIEW) without answer corruption
 * 6. Ingress sequence binding to last_server_sequence foreign key
 * 7. Stream replay reconstruction & mathematical parity audit (100% parity verification)
 * 8. Candidate answered question summary projection for palette navigation and scoring
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { DeliveryPostgresAdapter } from './deliveryPostgresAdapter';
import { SessionOrchestrator } from './sessionOrchestrator';
import { SubmissionIngestionGateway } from './submissionIngestionGateway';
import { QuestionStateMachine } from './questionStateMachine';
import { ExamSessionRecord, SubmissionEventEnvelope } from './deliveryTypes';

describe('UADUE Phase 3.4 — Candidate Question State Machine Invariant Suite', () => {
  let pool: Pool;
  let adapter: DeliveryPostgresAdapter;
  let orchestrator: SessionOrchestrator;
  let gateway: SubmissionIngestionGateway;
  let stateMachine: QuestionStateMachine;

  const TEST_PACKAGE_ID = 'pkg_uadue_phase3_test_001';
  const TEST_SEAL = 'seal_uadue_phase3_sha256_mock_valid_seal';
  const TENANT_ID = 'tenant_qstate_test';

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
    orchestrator = new SessionOrchestrator(adapter);
    gateway = new SubmissionIngestionGateway(adapter, orchestrator);
    stateMachine = new QuestionStateMachine(adapter);

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

  const setupSession = async (
    sessionId: string,
    candidateId: string
  ): Promise<ExamSessionRecord> => {
    const nowIso = new Date().toISOString();
    const session: ExamSessionRecord = {
      examSessionId: sessionId,
      tenantId: TENANT_ID,
      candidateId,
      packageId: TEST_PACKAGE_ID,
      packageIntegritySeal: TEST_SEAL,
      sessionConfiguration: {},
      sessionState: 'ACTIVE',
      stateVersion: 2,
      currentLeaseId: 'lease_qstate_101',
      leaseHeartbeatAt: nowIso,
      scheduledStartAt: nowIso,
      actualStartedAt: nowIso,
      durationSeconds: 3600,
      accumulatedPauseSeconds: 0,
      pauseCount: 0,
      submittedAt: null,
      expiredAt: null,
      terminatedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await adapter.createExamSession(session);
    return session;
  };

  const emitAndReduce = async (params: {
    sessionId: string;
    questionId: string;
    eventType: string;
    payload: Record<string, unknown>;
    clientSeq: number;
    clientEventId: string;
  }) => {
    const envelope: SubmissionEventEnvelope = {
      clientEventId: params.clientEventId,
      examSessionId: params.sessionId,
      tenantId: TENANT_ID,
      sessionLeaseId: 'lease_qstate_101',
      packageId: TEST_PACKAGE_ID,
      packageIntegritySeal: TEST_SEAL,
      canonicalQuestionId: params.questionId,
      representationId: 'rep_001',
      clientSequenceNumber: params.clientSeq,
      eventType: params.eventType,
      payload: params.payload,
      clientTimestamp: new Date().toISOString(),
    };

    const receipt = await gateway.ingestSubmission(envelope);

    const eventRecord = {
      eventId: `sub_evt_${params.clientEventId}`,
      examSessionId: params.sessionId,
      tenantId: TENANT_ID,
      canonicalQuestionId: params.questionId,
      representationId: 'rep_001',
      packageId: TEST_PACKAGE_ID,
      packageIntegritySeal: TEST_SEAL,
      clientSequenceNumber: params.clientSeq,
      serverSequenceNumber: receipt.serverSequenceNumber,
      clientEventId: params.clientEventId,
      eventType: params.eventType,
      candidateResponse: params.payload,
      responseFingerprint: receipt.responseFingerprint,
      receiptId: receipt.receiptId,
      serverSignature: receipt.serverSignature,
      clientTimestamp: envelope.clientTimestamp,
    };

    const state = await stateMachine.applySubmissionEvent(eventRecord);
    return { receipt, state };
  };

  // ==========================================================================
  // Invariant 1: Single Choice Selection Reduction (R3-01)
  // ==========================================================================
  it('QSM-1: Single choice selection reduces into server-authoritative question state', async () => {
    const sessionId = 'sess_qsm_single';
    await setupSession(sessionId, 'cand_qsm_001');

    const { state } = await emitAndReduce({
      sessionId,
      questionId: 'q_single_001',
      eventType: 'SINGLE_CHOICE_SELECT',
      payload: { selectedOptionId: 'opt_A' },
      clientSeq: 1,
      clientEventId: 'evt_single_001',
    });

    expect(state.currentStateVersion).toBe(1);
    expect(state.selectedOptionId).toBe('opt_A');
    expect(state.isAnswered).toBe(true);
    expect(state.lastClientEventId).toBe('evt_single_001');

    // Read back directly from PostgreSQL
    const dbState = await adapter.getQuestionState(sessionId, 'q_single_001', TENANT_ID);
    expect(dbState).not.toBeNull();
    expect(dbState?.selectedOptionId).toBe('opt_A');
    expect(dbState?.isAnswered).toBe(true);
    expect(dbState?.currentStateVersion).toBe(1);
  });

  // ==========================================================================
  // Invariant 2: Sequential Revision Chain (Select -> Switch -> Clear -> Re-select)
  // ==========================================================================
  it('QSM-2: Monotonic version advances across Select -> Switch -> Clear -> Re-select', async () => {
    const sessionId = 'sess_qsm_chain';
    await setupSession(sessionId, 'cand_qsm_002');
    const questionId = 'q_chain_001';

    // 1. Initial selection: Option A (v1)
    const { state: s1 } = await emitAndReduce({
      sessionId,
      questionId,
      eventType: 'SINGLE_CHOICE_SELECT',
      payload: { selectedOptionId: 'opt_A' },
      clientSeq: 1,
      clientEventId: 'evt_chain_001',
    });
    expect(s1.currentStateVersion).toBe(1);
    expect(s1.selectedOptionId).toBe('opt_A');
    expect(s1.isAnswered).toBe(true);

    // 2. Switch selection: Option B (v2)
    const { state: s2 } = await emitAndReduce({
      sessionId,
      questionId,
      eventType: 'SINGLE_CHOICE_SELECT',
      payload: { selectedOptionId: 'opt_B' },
      clientSeq: 2,
      clientEventId: 'evt_chain_002',
    });
    expect(s2.currentStateVersion).toBe(2);
    expect(s2.selectedOptionId).toBe('opt_B');
    expect(s2.isAnswered).toBe(true);

    // 3. Clear response: CLEAR_RESPONSE (v3)
    const { state: s3 } = await emitAndReduce({
      sessionId,
      questionId,
      eventType: 'CLEAR_RESPONSE',
      payload: {},
      clientSeq: 3,
      clientEventId: 'evt_chain_003',
    });
    expect(s3.currentStateVersion).toBe(3);
    expect(s3.selectedOptionId).toBeNull();
    expect(s3.responsePayload).toBeNull();
    expect(s3.isAnswered).toBe(false);

    // 4. Re-select: Option C (v4)
    const { state: s4 } = await emitAndReduce({
      sessionId,
      questionId,
      eventType: 'SINGLE_CHOICE_SELECT',
      payload: { selectedOptionId: 'opt_C' },
      clientSeq: 4,
      clientEventId: 'evt_chain_004',
    });
    expect(s4.currentStateVersion).toBe(4);
    expect(s4.selectedOptionId).toBe('opt_C');
    expect(s4.isAnswered).toBe(true);

    // Confirm that EXACTLY 1 row exists in candidate_question_states for this question
    const client = await pool.connect();
    try {
      const res = await client.query(
        'SELECT COUNT(*) FROM public.candidate_question_states WHERE exam_session_id = $1 AND canonical_question_id = $2',
        [sessionId, questionId]
      );
      expect(Number(res.rows[0].count)).toBe(1);
    } finally {
      client.release();
    }
  });

  // ==========================================================================
  // Invariant 3: Multiple Choice Selection Reduction
  // ==========================================================================
  it('QSM-3: Multiple choice selection reduces array options and marks answered', async () => {
    const sessionId = 'sess_qsm_multi';
    await setupSession(sessionId, 'cand_qsm_003');

    const { state } = await emitAndReduce({
      sessionId,
      questionId: 'q_multi_001',
      eventType: 'MULTIPLE_CHOICE_SELECT',
      payload: { selectedOptionIds: ['opt_A', 'opt_D'] },
      clientSeq: 1,
      clientEventId: 'evt_multi_001',
    });

    expect(state.currentStateVersion).toBe(1);
    expect(state.isAnswered).toBe(true);
    expect(state.responsePayload).toEqual({ selectedOptionIds: ['opt_A', 'opt_D'] });
  });

  // ==========================================================================
  // Invariant 4: Numerical Value Entry Reduction
  // ==========================================================================
  it('QSM-4: Numerical value entry reduces value and flags answered; empty string marks unanswered', async () => {
    const sessionId = 'sess_qsm_num';
    await setupSession(sessionId, 'cand_qsm_004');
    const questionId = 'q_num_001';

    // 1. Enter valid numerical value
    const { state: s1 } = await emitAndReduce({
      sessionId,
      questionId,
      eventType: 'NUMERICAL_VALUE_ENTRY',
      payload: { enteredValue: '3.14159' },
      clientSeq: 1,
      clientEventId: 'evt_num_001',
    });
    expect(s1.currentStateVersion).toBe(1);
    expect(s1.isAnswered).toBe(true);
    expect(s1.responsePayload).toEqual({ enteredValue: '3.14159' });

    // 2. Empty string entry -> marks unanswered
    const { state: s2 } = await emitAndReduce({
      sessionId,
      questionId,
      eventType: 'NUMERICAL_VALUE_ENTRY',
      payload: { enteredValue: '' },
      clientSeq: 2,
      clientEventId: 'evt_num_002',
    });
    expect(s2.currentStateVersion).toBe(2);
    expect(s2.isAnswered).toBe(false);
  });

  // ==========================================================================
  // Invariant 5: Review Flag Toggle (MARK_FOR_REVIEW / UNMARK_FOR_REVIEW)
  // ==========================================================================
  it('QSM-5: Review flags toggle metadata without altering answered option selection', async () => {
    const sessionId = 'sess_qsm_review';
    await setupSession(sessionId, 'cand_qsm_005');
    const questionId = 'q_review_001';

    // 1. Select Option A
    await emitAndReduce({
      sessionId,
      questionId,
      eventType: 'SINGLE_CHOICE_SELECT',
      payload: { selectedOptionId: 'opt_A' },
      clientSeq: 1,
      clientEventId: 'evt_rev_001',
    });

    // 2. Mark for review
    const { state: s2 } = await emitAndReduce({
      sessionId,
      questionId,
      eventType: 'MARK_FOR_REVIEW',
      payload: {},
      clientSeq: 2,
      clientEventId: 'evt_rev_002',
    });
    expect(s2.currentStateVersion).toBe(2);
    expect(s2.selectedOptionId).toBe('opt_A');
    expect(s2.isAnswered).toBe(true);
    expect((s2.responsePayload as any).isMarkedForReview).toBe(true);

    // 3. Unmark review
    const { state: s3 } = await emitAndReduce({
      sessionId,
      questionId,
      eventType: 'UNMARK_FOR_REVIEW',
      payload: {},
      clientSeq: 3,
      clientEventId: 'evt_rev_003',
    });
    expect(s3.currentStateVersion).toBe(3);
    expect(s3.selectedOptionId).toBe('opt_A');
    expect(s3.isAnswered).toBe(true);
    expect((s3.responsePayload as any).isMarkedForReview).toBe(false);
  });

  // ==========================================================================
  // Invariant 6: Ingress Sequence Binding (last_server_sequence FK)
  // ==========================================================================
  it('QSM-6: last_server_sequence strictly advances with ingress sequence allocations', async () => {
    const sessionId = 'sess_qsm_seq';
    await setupSession(sessionId, 'cand_qsm_006');
    const questionId = 'q_seq_001';

    const { receipt: r1, state: s1 } = await emitAndReduce({
      sessionId,
      questionId,
      eventType: 'SINGLE_CHOICE_SELECT',
      payload: { selectedOptionId: 'opt_A' },
      clientSeq: 1,
      clientEventId: 'evt_seq_001',
    });
    expect(s1.lastServerSequence).toBe(r1.serverSequenceNumber);

    const { receipt: r2, state: s2 } = await emitAndReduce({
      sessionId,
      questionId,
      eventType: 'SINGLE_CHOICE_SELECT',
      payload: { selectedOptionId: 'opt_B' },
      clientSeq: 2,
      clientEventId: 'evt_seq_002',
    });
    expect(s2.lastServerSequence).toBe(r2.serverSequenceNumber);
    expect(s2.lastServerSequence).toBeGreaterThan(s1.lastServerSequence);
  });

  // ==========================================================================
  // Invariant 7: Stream Replay Reconstruction & 100% Mathematical Parity Audit
  // ==========================================================================
  it('QSM-7: Stream replay reconstruction produces 100% mathematical parity with persisted state', async () => {
    const sessionId = 'sess_qsm_parity';
    await setupSession(sessionId, 'cand_qsm_007');

    // Emit interaction sequence across 3 questions:
    // Q1: A -> B
    await emitAndReduce({
      sessionId,
      questionId: 'q_p_01',
      eventType: 'SINGLE_CHOICE_SELECT',
      payload: { selectedOptionId: 'opt_1A' },
      clientSeq: 1,
      clientEventId: 'evt_p_001',
    });
    await emitAndReduce({
      sessionId,
      questionId: 'q_p_01',
      eventType: 'SINGLE_CHOICE_SELECT',
      payload: { selectedOptionId: 'opt_1B' },
      clientSeq: 2,
      clientEventId: 'evt_p_002',
    });

    // Q2: C -> Clear
    await emitAndReduce({
      sessionId,
      questionId: 'q_p_02',
      eventType: 'SINGLE_CHOICE_SELECT',
      payload: { selectedOptionId: 'opt_2C' },
      clientSeq: 3,
      clientEventId: 'evt_p_003',
    });
    await emitAndReduce({
      sessionId,
      questionId: 'q_p_02',
      eventType: 'CLEAR_RESPONSE',
      payload: {},
      clientSeq: 4,
      clientEventId: 'evt_p_004',
    });

    // Q3: Numerical 99.5
    await emitAndReduce({
      sessionId,
      questionId: 'q_p_03',
      eventType: 'NUMERICAL_VALUE_ENTRY',
      payload: { enteredValue: '99.5' },
      clientSeq: 5,
      clientEventId: 'evt_p_005',
    });

    // Verify Replay Parity
    const audit = await stateMachine.verifyStateReplayParity(sessionId, TENANT_ID);
    expect(audit.parity).toBe(true);
    expect(audit.mismatches).toEqual([]);
  });

  // ==========================================================================
  // Invariant 8: Session Question Summary Projection
  // ==========================================================================
  it('QSM-8: Generates accurate answered question summary for palette navigation', async () => {
    const sessionId = 'sess_qsm_summary';
    await setupSession(sessionId, 'cand_qsm_008');

    // Q1 Answered
    await emitAndReduce({
      sessionId,
      questionId: 'q_sum_01',
      eventType: 'SINGLE_CHOICE_SELECT',
      payload: { selectedOptionId: 'opt_A' },
      clientSeq: 1,
      clientEventId: 'evt_sum_001',
    });

    // Q2 Answered
    await emitAndReduce({
      sessionId,
      questionId: 'q_sum_02',
      eventType: 'NUMERICAL_VALUE_ENTRY',
      payload: { enteredValue: '123' },
      clientSeq: 2,
      clientEventId: 'evt_sum_002',
    });

    // Q3 Answered then Cleared -> Unanswered
    await emitAndReduce({
      sessionId,
      questionId: 'q_sum_03',
      eventType: 'SINGLE_CHOICE_SELECT',
      payload: { selectedOptionId: 'opt_C' },
      clientSeq: 3,
      clientEventId: 'evt_sum_003',
    });
    await emitAndReduce({
      sessionId,
      questionId: 'q_sum_03',
      eventType: 'CLEAR_RESPONSE',
      payload: {},
      clientSeq: 4,
      clientEventId: 'evt_sum_004',
    });

    const summary = await stateMachine.getSessionQuestionSummary(sessionId, TENANT_ID);
    expect(summary.totalQuestions).toBe(3);
    expect(summary.answeredCount).toBe(2);
    expect(summary.unansweredCount).toBe(1);
    expect(summary.answeredQuestionIds).toContain('q_sum_01');
    expect(summary.answeredQuestionIds).toContain('q_sum_02');
    expect(summary.unansweredQuestionIds).toContain('q_sum_03');
  });
});
