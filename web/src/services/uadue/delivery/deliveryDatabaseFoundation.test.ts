/**
 * UADUE Phase 3.1 — Database Foundation Integration & Invariant Verification Suite
 * Specification: UADUE-P3-HARD-R3-001 (R3 Final Hardened Contract)
 *
 * Verifies against REAL PostgreSQL database (mockai_uadue_test):
 * 1. 21-Table Schema Coexistence (12 Phase 2D-8 tables + 9 Phase 3.1 tables)
 * 2. Foreign Key Constraint Enforcement (Phase 3 exam_sessions -> Phase 2 canonical packages)
 * 3. Database-Level Append-Only Immutability Triggers (P0001 rejection of UPDATE & DELETE)
 * 4. Row-Level Security (RLS) Tenant Isolation & Cross-Tenant Intrusion Prevention
 * 5. Primary Event Idempotency on (exam_session_id, client_event_id) & Transition Idempotency
 * 6. Server-Authoritative Question State Upsert & Revision Tracking (R3-01 Contract)
 * 7. Evaluation Run & Question Score Ledger Integrity
 * 8. Audit Trail Durability and Immutability
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import {
  DeliveryPostgresAdapter,
  DeliveryImmutabilityViolationError,
  DeliveryUniqueConstraintError,
  DeliveryForeignKeyViolationError,
} from './deliveryPostgresAdapter';
import {
  ExamSessionRecord,
  ExamSessionTransitionRecord,
  ExamSessionProjectionRecord,
  CandidateSubmissionEventRecord,
  CandidateQuestionStateRecord,
  CandidateEvaluationRunRecord,
  CandidateQuestionScoreRecord,
  AuditEventRecord,
} from './deliveryTypes';

describe('UADUE Phase 3.1 — Database Foundation Invariant Suite', () => {
  let pool: Pool;
  let adapter: DeliveryPostgresAdapter;

  const TEST_PACKAGE_ID = 'pkg_uadue_phase3_test_001';
  const TEST_SEAL = 'seal_uadue_phase3_sha256_mock_valid_seal';

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

    // Ensure a seed canonical package exists in Phase 2 table for FK references
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
      // Truncate Phase 3 tables cleanly
      await client.query('TRUNCATE TABLE public.exam_sessions, public.audit_events CASCADE');
    } finally {
      client.release();
    }
  });

  // ==========================================================================
  // Invariant 1: 21-Table Schema Coexistence
  // ==========================================================================
  it('Inv-1: Exactly 21 tables coexist: 12 Phase 2D-8 tables + 9 Phase 3.1 tables', async () => {
    const client = await pool.connect();
    try {
      const res = await client.query(
        `SELECT table_name FROM information_schema.tables 
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         ORDER BY table_name`
      );
      const tableNames = res.rows.map((r: { table_name: string }) => r.table_name);

      const expectedPhase2Tables = [
        'canonical_answer_authority_resolutions',
        'canonical_assessment_packages',
        'canonical_assets',
        'canonical_family_memberships',
        'canonical_logical_families',
        'canonical_package_events',
        'canonical_package_supersessions',
        'canonical_package_tenancy',
        'canonical_quarantined_relationships',
        'canonical_question_representations',
        'canonical_questions',
        'canonical_relationship_evaluations',
      ];

      const expectedPhase3Tables = [
        'audit_events',
        'candidate_evaluation_runs',
        'candidate_question_scores',
        'candidate_question_states',
        'candidate_scoring_disputes',
        'candidate_submission_events',
        'exam_session_projections',
        'exam_session_transitions',
        'exam_sessions',
      ];

      expect(tableNames.length).toBe(21);
      for (const t of expectedPhase2Tables) {
        expect(tableNames).toContain(t);
      }
      for (const t of expectedPhase3Tables) {
        expect(tableNames).toContain(t);
      }
    } finally {
      client.release();
    }
  });

  // ==========================================================================
  // Invariant 2: Foreign Key Constraint Enforcement
  // ==========================================================================
  it('Inv-2: Foreign Key constraint blocks session insertion with non-existent package_id', async () => {
    const nonExistentSession: ExamSessionRecord = {
      examSessionId: 'sess_invalid_fk',
      tenantId: 'tenant_test',
      candidateId: 'cand_001',
      packageId: 'pkg_DOES_NOT_EXIST_IN_PHASE_2',
      packageIntegritySeal: 'seal_invalid',
      sessionConfiguration: { allowReview: true },
      sessionState: 'INITIALIZED',
      stateVersion: 1,
      currentLeaseId: 'lease_001',
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
    };

    // Must reject due to FK violation on canonical_assessment_packages
    await expect(adapter.createExamSession(nonExistentSession)).rejects.toThrow(
      DeliveryForeignKeyViolationError
    );

    // Now insert with valid Phase 2 package_id -> Must succeed
    const validSession: ExamSessionRecord = {
      ...nonExistentSession,
      examSessionId: 'sess_valid_fk',
      packageId: TEST_PACKAGE_ID,
      packageIntegritySeal: TEST_SEAL,
    };
    await adapter.createExamSession(validSession);

    const fetched = await adapter.getExamSession('sess_valid_fk', 'tenant_test');
    expect(fetched).not.toBeNull();
    expect(fetched?.examSessionId).toBe('sess_valid_fk');
    expect(fetched?.packageId).toBe(TEST_PACKAGE_ID);

    // Verify ON DELETE RESTRICT on referenced package:
    // Even if immutability trigger is bypassed by a privileged routine, FK RESTRICT prevents deletion
    const client = await pool.connect();
    try {
      await client.query("SELECT set_config('app.is_service_role', 'true', true)");
      await client.query('DELETE FROM public.canonical_package_tenancy WHERE package_id = $1', [TEST_PACKAGE_ID]);
      await client.query('ALTER TABLE public.canonical_assessment_packages DISABLE TRIGGER trg_canonical_packages_immutable');
      await expect(
        client.query('DELETE FROM public.canonical_assessment_packages WHERE package_id = $1', [
          TEST_PACKAGE_ID,
        ])
      ).rejects.toThrow(/violates.*foreign key constraint "exam_sessions_package_id_fkey"/);
      await client.query('ALTER TABLE public.canonical_assessment_packages ENABLE TRIGGER trg_canonical_packages_immutable');
    } finally {
      client.release();
    }
  });

  // ==========================================================================
  // Invariant 3: Database-Level Append-Only Immutability Triggers
  // ==========================================================================
  it('Inv-3: Database-level triggers block UPDATE and DELETE on append-only tables', async () => {
    const session: ExamSessionRecord = {
      examSessionId: 'sess_immutability',
      tenantId: 'tenant_immutability',
      candidateId: 'cand_immutability',
      packageId: TEST_PACKAGE_ID,
      packageIntegritySeal: TEST_SEAL,
      sessionConfiguration: {},
      sessionState: 'INITIALIZED',
      stateVersion: 1,
      currentLeaseId: 'lease_imm',
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
    };
    await adapter.createExamSession(session);

    // 1. Test candidate_submission_events immutability
    const event: CandidateSubmissionEventRecord = {
      eventId: 'evt_imm_001',
      examSessionId: session.examSessionId,
      tenantId: session.tenantId,
      canonicalQuestionId: 'q_001',
      representationId: 'rep_001',
      packageId: TEST_PACKAGE_ID,
      packageIntegritySeal: TEST_SEAL,
      clientSequenceNumber: 1,
      clientEventId: 'client_evt_001',
      eventType: 'OPTION_SELECTED',
      candidateResponse: { selectedOptionId: 'opt_A' },
      responseFingerprint: 'fp_001',
      receiptId: 'rcpt_001',
      serverSignature: 'sig_001',
      clientTimestamp: new Date().toISOString(),
    };
    await adapter.appendSubmissionEvent(event);

    const client = await pool.connect();
    try {
      await client.query("SELECT set_config('app.is_service_role', 'true', true)");

      // Direct SQL UPDATE on candidate_submission_events must fail
      await expect(
        client.query(
          "UPDATE public.candidate_submission_events SET event_type = 'TAMPERED' WHERE event_id = $1",
          [event.eventId]
        )
      ).rejects.toThrow(/UADUE Immutability Violation: In-place UPDATE operation is forbidden/);

      // Direct SQL DELETE on candidate_submission_events must fail
      await expect(
        client.query('DELETE FROM public.candidate_submission_events WHERE event_id = $1', [
          event.eventId,
        ])
      ).rejects.toThrow(/UADUE Immutability Violation: In-place DELETE operation is forbidden/);

      // 2. Test exam_session_transitions immutability
      const transition: ExamSessionTransitionRecord = {
        transitionId: 'tr_imm_001',
        examSessionId: session.examSessionId,
        tenantId: session.tenantId,
        transitionRequestId: 'req_imm_001',
        fromState: 'INITIALIZED',
        toState: 'ACTIVE',
        fromVersion: 1,
        toVersion: 2,
        idempotencyHash: 'hash_001',
        transitionReceipt: { status: 'OK' },
        recordedAt: new Date().toISOString(),
      };
      await adapter.recordSessionTransition(transition);

      await expect(
        client.query(
          "UPDATE public.exam_session_transitions SET to_state = 'TERMINATED' WHERE transition_id = $1",
          [transition.transitionId]
        )
      ).rejects.toThrow(/UADUE Immutability Violation: In-place UPDATE operation is forbidden/);

      await expect(
        client.query('DELETE FROM public.exam_session_transitions WHERE transition_id = $1', [
          transition.transitionId,
        ])
      ).rejects.toThrow(/UADUE Immutability Violation: In-place DELETE operation is forbidden/);

      // 3. Test candidate_evaluation_runs immutability
      const evalRun: CandidateEvaluationRunRecord = {
        evaluationRunId: 'eval_imm_001',
        examSessionId: session.examSessionId,
        tenantId: session.tenantId,
        packageId: TEST_PACKAGE_ID,
        packageIntegritySeal: TEST_SEAL,
        scoringPolicyVersion: '1.0.0',
        answerKeyVersion: '1.0.0',
        evaluationContractTuple: {},
        runIteration: 1,
        supersedesRunId: null,
        totalRawScore: 100,
        totalNormalizedScore: 100,
        questionsAttempted: 1,
        questionsCorrect: 1,
        questionsIncorrect: 0,
        questionsUnanswered: 0,
        evaluationSignature: 'sig_eval_001',
        evaluatedAt: new Date().toISOString(),
      };
      await adapter.createEvaluationRun(evalRun);

      await expect(
        client.query(
          'UPDATE public.candidate_evaluation_runs SET total_raw_score = 999 WHERE evaluation_run_id = $1',
          [evalRun.evaluationRunId]
        )
      ).rejects.toThrow(/UADUE Immutability Violation: In-place UPDATE operation is forbidden/);

      await expect(
        client.query('DELETE FROM public.candidate_evaluation_runs WHERE evaluation_run_id = $1', [
          evalRun.evaluationRunId,
        ])
      ).rejects.toThrow(/UADUE Immutability Violation: In-place DELETE operation is forbidden/);

      // 4. Test candidate_question_scores immutability
      const qScore: CandidateQuestionScoreRecord = {
        questionScoreId: 'qs_imm_001',
        evaluationRunId: evalRun.evaluationRunId,
        tenantId: session.tenantId,
        canonicalQuestionId: 'q_001',
        candidateResponseRaw: { selected: 'opt_A' },
        resolvedCorrectKey: { correct: 'opt_A' },
        isCorrect: true,
        isPartiallyCorrect: false,
        marksAwarded: 2.0,
        penaltyDeducted: 0.0,
        netScore: 2.0,
        disposition: 'NORMAL',
        createdAt: new Date().toISOString(),
      };
      await adapter.recordQuestionScores([qScore]);

      await expect(
        client.query(
          'UPDATE public.candidate_question_scores SET net_score = 5.0 WHERE question_score_id = $1',
          [qScore.questionScoreId]
        )
      ).rejects.toThrow(/UADUE Immutability Violation: In-place UPDATE operation is forbidden/);

      await expect(
        client.query('DELETE FROM public.candidate_question_scores WHERE question_score_id = $1', [
          qScore.questionScoreId,
        ])
      ).rejects.toThrow(/UADUE Immutability Violation: In-place DELETE operation is forbidden/);

      // 5. Test audit_events immutability
      const auditEvt: AuditEventRecord = {
        auditEventId: 'audit_imm_001',
        tenantId: session.tenantId,
        eventType: 'SESSION_STARTED',
        severity: 'INFO',
        actorType: 'CANDIDATE',
        actorId: session.candidateId,
        resourceType: 'EXAM_SESSION',
        resourceId: session.examSessionId,
        eventPayload: { ip: '127.0.0.1' },
        recordedAt: new Date().toISOString(),
      };
      await adapter.recordAuditEvent(auditEvt);

      await expect(
        client.query(
          "UPDATE public.audit_events SET severity = 'FATAL' WHERE audit_event_id = $1",
          [auditEvt.auditEventId]
        )
      ).rejects.toThrow(/UADUE Immutability Violation: In-place UPDATE operation is forbidden/);

      await expect(
        client.query('DELETE FROM public.audit_events WHERE audit_event_id = $1', [
          auditEvt.auditEventId,
        ])
      ).rejects.toThrow(/UADUE Immutability Violation: In-place DELETE operation is forbidden/);
    } finally {
      client.release();
    }
  });

  // ==========================================================================
  // Invariant 4: Row-Level Security (RLS) Tenant Isolation
  // ==========================================================================
  it('Inv-4: PostgreSQL RLS prevents Tenant B from accessing Tenant A delivery records', async () => {
    const sessionAlpha: ExamSessionRecord = {
      examSessionId: 'sess_alpha_001',
      tenantId: 'tenant_alpha',
      candidateId: 'cand_alpha_001',
      packageId: TEST_PACKAGE_ID,
      packageIntegritySeal: TEST_SEAL,
      sessionConfiguration: {},
      sessionState: 'ACTIVE',
      stateVersion: 1,
      currentLeaseId: 'lease_alpha',
      leaseHeartbeatAt: new Date().toISOString(),
      scheduledStartAt: new Date().toISOString(),
      actualStartedAt: new Date().toISOString(),
      durationSeconds: 3600,
      accumulatedPauseSeconds: 0,
      pauseCount: 0,
      submittedAt: null,
      expiredAt: null,
      terminatedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await adapter.createExamSession(sessionAlpha);

    const submissionAlpha: CandidateSubmissionEventRecord = {
      eventId: 'sub_alpha_001',
      examSessionId: sessionAlpha.examSessionId,
      tenantId: sessionAlpha.tenantId,
      canonicalQuestionId: 'q_alpha_01',
      representationId: 'rep_alpha_01',
      packageId: TEST_PACKAGE_ID,
      packageIntegritySeal: TEST_SEAL,
      clientSequenceNumber: 1,
      clientEventId: 'evt_client_alpha_1',
      eventType: 'OPTION_SELECTED',
      candidateResponse: { option: 'opt_A' },
      responseFingerprint: 'fp_sub_alpha',
      receiptId: 'rcpt_sub_alpha',
      serverSignature: 'sig_sub_alpha',
      clientTimestamp: new Date().toISOString(),
    };
    const { serverSequenceNumber } = await adapter.appendSubmissionEvent(submissionAlpha);

    const questionStateAlpha: CandidateQuestionStateRecord = {
      stateId: 'qs_alpha_001',
      examSessionId: sessionAlpha.examSessionId,
      tenantId: sessionAlpha.tenantId,
      canonicalQuestionId: 'q_alpha_01',
      currentStateVersion: 1,
      selectedOptionId: 'opt_A',
      responsePayload: { option: 'opt_A' },
      payloadFingerprint: 'fp_alpha',
      lastServerSequence: serverSequenceNumber,
      lastClientEventId: 'evt_client_alpha_1',
      isAnswered: true,
      updatedAt: new Date().toISOString(),
    };
    await adapter.upsertQuestionState(questionStateAlpha);

    // 1. Tenant Alpha can read its own records
    const alphaSession = await adapter.getExamSession(sessionAlpha.examSessionId, 'tenant_alpha');
    expect(alphaSession).not.toBeNull();
    expect(alphaSession?.candidateId).toBe('cand_alpha_001');

    const alphaQState = await adapter.getQuestionState(
      sessionAlpha.examSessionId,
      'q_alpha_01',
      'tenant_alpha'
    );
    expect(alphaQState).not.toBeNull();
    expect(alphaQState?.selectedOptionId).toBe('opt_A');

    const alphaSubs = await adapter.getSubmissionEvents(sessionAlpha.examSessionId, 'tenant_alpha');
    expect(alphaSubs.length).toBe(1);

    // 2. Tenant Beta attempts to read Tenant Alpha records -> MUST RETURN NULL / 0 ROWS
    const betaSession = await adapter.getExamSession(sessionAlpha.examSessionId, 'tenant_beta');
    expect(betaSession).toBeNull();

    const betaQState = await adapter.getQuestionState(
      sessionAlpha.examSessionId,
      'q_alpha_01',
      'tenant_beta'
    );
    expect(betaQState).toBeNull();

    const betaSubs = await adapter.getSubmissionEvents(sessionAlpha.examSessionId, 'tenant_beta');
    expect(betaSubs.length).toBe(0);

    // 3. Cross-tenant insertion attempt (Tenant Beta trying to insert a session for Tenant Alpha)
    const crossTenantSpoof: ExamSessionRecord = {
      ...sessionAlpha,
      examSessionId: 'sess_spoof_001',
      tenantId: 'tenant_alpha', // Claiming to be tenant_alpha
    };
    // Executing under tenant_beta context with tenant_alpha row tenant_id must violate WITH CHECK policy
    await expect(
      adapter.withTransaction('tenant_beta', async (client) => {
        await client.query(
          `INSERT INTO public.exam_sessions (
            exam_session_id, tenant_id, candidate_id, package_id, package_integrity_seal,
            session_configuration, session_state, state_version, current_lease_id,
            lease_heartbeat_at, scheduled_start_at, actual_started_at, duration_seconds,
            accumulated_pause_seconds, pause_count, submitted_at, expired_at, terminated_at,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
          [
            crossTenantSpoof.examSessionId,
            crossTenantSpoof.tenantId, // 'tenant_alpha'
            crossTenantSpoof.candidateId,
            crossTenantSpoof.packageId,
            crossTenantSpoof.packageIntegritySeal,
            JSON.stringify(crossTenantSpoof.sessionConfiguration),
            crossTenantSpoof.sessionState,
            crossTenantSpoof.stateVersion,
            crossTenantSpoof.currentLeaseId,
            crossTenantSpoof.leaseHeartbeatAt,
            crossTenantSpoof.scheduledStartAt,
            crossTenantSpoof.actualStartedAt,
            crossTenantSpoof.durationSeconds,
            crossTenantSpoof.accumulatedPauseSeconds,
            crossTenantSpoof.pauseCount,
            crossTenantSpoof.submittedAt,
            crossTenantSpoof.expiredAt,
            crossTenantSpoof.terminatedAt,
            crossTenantSpoof.createdAt,
            crossTenantSpoof.updatedAt,
          ]
        );
      })
    ).rejects.toThrow(/new row violates row-level security policy for table "exam_sessions"/);
  });

  // ==========================================================================
  // Invariant 5: Primary Event Idempotency on (exam_session_id, client_event_id)
  // ==========================================================================
  it('Inv-5: Primary event idempotency binds strictly to (exam_session_id, client_event_id)', async () => {
    const session: ExamSessionRecord = {
      examSessionId: 'sess_idemp_001',
      tenantId: 'tenant_idemp',
      candidateId: 'cand_idemp_001',
      packageId: TEST_PACKAGE_ID,
      packageIntegritySeal: TEST_SEAL,
      sessionConfiguration: {},
      sessionState: 'ACTIVE',
      stateVersion: 1,
      currentLeaseId: 'lease_idemp',
      leaseHeartbeatAt: new Date().toISOString(),
      scheduledStartAt: new Date().toISOString(),
      actualStartedAt: new Date().toISOString(),
      durationSeconds: 3600,
      accumulatedPauseSeconds: 0,
      pauseCount: 0,
      submittedAt: null,
      expiredAt: null,
      terminatedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await adapter.createExamSession(session);

    const event1: CandidateSubmissionEventRecord = {
      eventId: 'evt_idemp_001',
      examSessionId: session.examSessionId,
      tenantId: session.tenantId,
      canonicalQuestionId: 'q_001',
      representationId: 'rep_001',
      packageId: TEST_PACKAGE_ID,
      packageIntegritySeal: TEST_SEAL,
      clientSequenceNumber: 1,
      clientEventId: 'client_event_alpha_unique',
      eventType: 'OPTION_SELECTED',
      candidateResponse: { selectedOptionId: 'opt_A' },
      responseFingerprint: 'fp_idemp_1',
      receiptId: 'rcpt_idemp_1',
      serverSignature: 'sig_idemp_1',
      clientTimestamp: new Date().toISOString(),
    };

    // First attempt -> succeeds and returns serverSequenceNumber = 1
    const { serverSequenceNumber } = await adapter.appendSubmissionEvent(event1);
    expect(serverSequenceNumber).toBeGreaterThanOrEqual(1);

    // Duplicate client_event_id within same session -> MUST FAIL WITH DeliveryUniqueConstraintError
    const duplicateEvent: CandidateSubmissionEventRecord = {
      ...event1,
      eventId: 'evt_idemp_002', // different internal PK
      clientSequenceNumber: 2, // different advisory clientSequenceNumber
      candidateResponse: { selectedOptionId: 'opt_B' }, // conflicting payload
    };

    await expect(adapter.appendSubmissionEvent(duplicateEvent)).rejects.toThrow(
      DeliveryUniqueConstraintError
    );

    // Transition request idempotency on (exam_session_id, transition_request_id)
    const transition1: ExamSessionTransitionRecord = {
      transitionId: 'tr_idemp_001',
      examSessionId: session.examSessionId,
      tenantId: session.tenantId,
      transitionRequestId: 'tx_req_unique_001',
      fromState: 'ACTIVE',
      toState: 'PAUSED',
      fromVersion: 1,
      toVersion: 2,
      idempotencyHash: 'hash_tx_1',
      transitionReceipt: { status: 'PAUSED' },
      recordedAt: new Date().toISOString(),
    };
    await adapter.recordSessionTransition(transition1);

    const duplicateTransition: ExamSessionTransitionRecord = {
      ...transition1,
      transitionId: 'tr_idemp_002',
      fromVersion: 2,
      toVersion: 3,
    };
    await expect(adapter.recordSessionTransition(duplicateTransition)).rejects.toThrow(
      DeliveryUniqueConstraintError
    );
  });

  // ==========================================================================
  // Invariant 6: Server-Authoritative Question State Upsert & Revision Tracking
  // ==========================================================================
  it('Inv-6: Server-authoritative candidate_question_states tracks current state in-place (R3-01)', async () => {
    const session: ExamSessionRecord = {
      examSessionId: 'sess_authoritative_state',
      tenantId: 'tenant_state',
      candidateId: 'cand_state_001',
      packageId: TEST_PACKAGE_ID,
      packageIntegritySeal: TEST_SEAL,
      sessionConfiguration: {},
      sessionState: 'ACTIVE',
      stateVersion: 1,
      currentLeaseId: 'lease_state',
      leaseHeartbeatAt: new Date().toISOString(),
      scheduledStartAt: new Date().toISOString(),
      actualStartedAt: new Date().toISOString(),
      durationSeconds: 3600,
      accumulatedPauseSeconds: 0,
      pauseCount: 0,
      submittedAt: null,
      expiredAt: null,
      terminatedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await adapter.createExamSession(session);

    // 0. Verify that upserting question state with non-existent lastServerSequence is rejected by FK constraint
    const orphanState: CandidateQuestionStateRecord = {
      stateId: 'state_orphan_001',
      examSessionId: session.examSessionId,
      tenantId: session.tenantId,
      canonicalQuestionId: 'q_test_101',
      currentStateVersion: 1,
      selectedOptionId: 'opt_A',
      responsePayload: { selectedOptionId: 'opt_A' },
      payloadFingerprint: 'fp_v1',
      lastServerSequence: 999999, // Non-existent sequence number
      lastClientEventId: 'client_evt_orphan',
      isAnswered: true,
      updatedAt: new Date().toISOString(),
    };
    await expect(adapter.upsertQuestionState(orphanState)).rejects.toThrow(
      DeliveryForeignKeyViolationError
    );

    // 1. Initial selection: Candidate chooses Option A (appends to immutable submission ledger first)
    const sub1: CandidateSubmissionEventRecord = {
      eventId: 'sub_state_001',
      examSessionId: session.examSessionId,
      tenantId: session.tenantId,
      canonicalQuestionId: 'q_test_101',
      representationId: 'rep_test_101',
      packageId: TEST_PACKAGE_ID,
      packageIntegritySeal: TEST_SEAL,
      clientSequenceNumber: 1,
      clientEventId: 'client_evt_1',
      eventType: 'OPTION_SELECTED',
      candidateResponse: { selectedOptionId: 'opt_A' },
      responseFingerprint: 'fp_v1',
      receiptId: 'rcpt_sub_1',
      serverSignature: 'sig_sub_1',
      clientTimestamp: new Date().toISOString(),
    };
    const { serverSequenceNumber: seq1 } = await adapter.appendSubmissionEvent(sub1);

    const stateV1: CandidateQuestionStateRecord = {
      stateId: 'state_row_001',
      examSessionId: session.examSessionId,
      tenantId: session.tenantId,
      canonicalQuestionId: 'q_test_101',
      currentStateVersion: 1,
      selectedOptionId: 'opt_A',
      responsePayload: { selectedOptionId: 'opt_A' },
      payloadFingerprint: 'fp_v1',
      lastServerSequence: seq1,
      lastClientEventId: 'client_evt_1',
      isAnswered: true,
      updatedAt: new Date().toISOString(),
    };
    await adapter.upsertQuestionState(stateV1);

    let state = await adapter.getQuestionState(
      session.examSessionId,
      'q_test_101',
      session.tenantId
    );
    expect(state).not.toBeNull();
    expect(state?.currentStateVersion).toBe(1);
    expect(state?.selectedOptionId).toBe('opt_A');
    expect(state?.lastServerSequence).toBe(seq1);
    expect(state?.isAnswered).toBe(true);

    // 2. Revision: Candidate switches to Option B (appends second event to ledger)
    const sub2: CandidateSubmissionEventRecord = {
      ...sub1,
      eventId: 'sub_state_002',
      clientSequenceNumber: 2,
      clientEventId: 'client_evt_2',
      candidateResponse: { selectedOptionId: 'opt_B' },
      responseFingerprint: 'fp_v2',
      receiptId: 'rcpt_sub_2',
    };
    const { serverSequenceNumber: seq2 } = await adapter.appendSubmissionEvent(sub2);

    const stateV2: CandidateQuestionStateRecord = {
      ...stateV1,
      currentStateVersion: 2,
      selectedOptionId: 'opt_B',
      responsePayload: { selectedOptionId: 'opt_B' },
      payloadFingerprint: 'fp_v2',
      lastServerSequence: seq2,
      lastClientEventId: 'client_evt_2',
      updatedAt: new Date().toISOString(),
    };
    await adapter.upsertQuestionState(stateV2);

    state = await adapter.getQuestionState(
      session.examSessionId,
      'q_test_101',
      session.tenantId
    );
    expect(state).not.toBeNull();
    expect(state?.currentStateVersion).toBe(2);
    expect(state?.selectedOptionId).toBe('opt_B');
    expect(state?.lastServerSequence).toBe(seq2);
    expect(state?.isAnswered).toBe(true);

    // 3. Clear Response: Candidate deselects / clears answer (appends clear event to ledger)
    const sub3: CandidateSubmissionEventRecord = {
      ...sub1,
      eventId: 'sub_state_003',
      clientSequenceNumber: 3,
      clientEventId: 'client_evt_3',
      eventType: 'OPTION_CLEARED',
      candidateResponse: {},
      responseFingerprint: 'fp_v3',
      receiptId: 'rcpt_sub_3',
    };
    const { serverSequenceNumber: seq3 } = await adapter.appendSubmissionEvent(sub3);

    const stateV3: CandidateQuestionStateRecord = {
      ...stateV1,
      currentStateVersion: 3,
      selectedOptionId: null,
      responsePayload: null,
      payloadFingerprint: null,
      lastServerSequence: seq3,
      lastClientEventId: 'client_evt_3',
      isAnswered: false,
      updatedAt: new Date().toISOString(),
    };
    await adapter.upsertQuestionState(stateV3);

    state = await adapter.getQuestionState(
      session.examSessionId,
      'q_test_101',
      session.tenantId
    );
    expect(state).not.toBeNull();
    expect(state?.currentStateVersion).toBe(3);
    expect(state?.selectedOptionId).toBeNull();
    expect(state?.lastServerSequence).toBe(seq3);
    expect(state?.isAnswered).toBe(false);

    // Confirm that EXACTLY 1 row exists in candidate_question_states for this question
    const client = await pool.connect();
    try {
      const rowCountRes = await client.query(
        `SELECT COUNT(*) FROM public.candidate_question_states 
         WHERE exam_session_id = $1 AND canonical_question_id = $2`,
        [session.examSessionId, 'q_test_101']
      );
      expect(Number(rowCountRes.rows[0].count)).toBe(1);
    } finally {
      client.release();
    }
  });

  // ==========================================================================
  // Invariant 7: Evaluation Run & Score Ledger Integrity
  // ==========================================================================
  it('Inv-7: Evaluation run and question scores enforce iteration uniqueness and relational integrity', async () => {
    const session: ExamSessionRecord = {
      examSessionId: 'sess_eval_run_001',
      tenantId: 'tenant_eval',
      candidateId: 'cand_eval_001',
      packageId: TEST_PACKAGE_ID,
      packageIntegritySeal: TEST_SEAL,
      sessionConfiguration: {},
      sessionState: 'SUBMITTED',
      stateVersion: 3,
      currentLeaseId: 'lease_eval',
      leaseHeartbeatAt: new Date().toISOString(),
      scheduledStartAt: new Date().toISOString(),
      actualStartedAt: new Date().toISOString(),
      durationSeconds: 3600,
      accumulatedPauseSeconds: 0,
      pauseCount: 0,
      submittedAt: new Date().toISOString(),
      expiredAt: null,
      terminatedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await adapter.createExamSession(session);

    const run1: CandidateEvaluationRunRecord = {
      evaluationRunId: 'eval_run_v1',
      examSessionId: session.examSessionId,
      tenantId: session.tenantId,
      packageId: TEST_PACKAGE_ID,
      packageIntegritySeal: TEST_SEAL,
      scoringPolicyVersion: 'SSC_CHSL_2024_STANDARD',
      answerKeyVersion: 'OFFICIAL_FINAL_2024_08_02',
      evaluationContractTuple: { formula: 'MARKS_AWARDED - PENALTY_DEDUCTED' },
      runIteration: 1,
      supersedesRunId: null,
      totalRawScore: 48.5,
      totalNormalizedScore: 52.3,
      questionsAttempted: 25,
      questionsCorrect: 20,
      questionsIncorrect: 5,
      questionsUnanswered: 0,
      evaluationSignature: 'sig_eval_run_v1',
      evaluatedAt: new Date().toISOString(),
    };
    await adapter.createEvaluationRun(run1);

    const scores: CandidateQuestionScoreRecord[] = [
      {
        questionScoreId: 'qs_item_001',
        evaluationRunId: run1.evaluationRunId,
        tenantId: session.tenantId,
        canonicalQuestionId: 'q_01',
        candidateResponseRaw: { selectedOptionId: 'opt_A' },
        resolvedCorrectKey: { correctOptionId: 'opt_A' },
        isCorrect: true,
        isPartiallyCorrect: false,
        marksAwarded: 2.0,
        penaltyDeducted: 0.0,
        netScore: 2.0,
        disposition: 'NORMAL',
        createdAt: new Date().toISOString(),
      },
      {
        questionScoreId: 'qs_item_002',
        evaluationRunId: run1.evaluationRunId,
        tenantId: session.tenantId,
        canonicalQuestionId: 'q_02',
        candidateResponseRaw: { selectedOptionId: 'opt_C' },
        resolvedCorrectKey: { correctOptionId: 'opt_B' },
        isCorrect: false,
        isPartiallyCorrect: false,
        marksAwarded: 0.0,
        penaltyDeducted: 0.5,
        netScore: -0.5,
        disposition: 'NORMAL',
        createdAt: new Date().toISOString(),
      },
    ];
    await adapter.recordQuestionScores(scores);

    // Read back run and item scores
    const fetchedRun = await adapter.getEvaluationRun(run1.evaluationRunId, session.tenantId);
    expect(fetchedRun).not.toBeNull();
    expect(fetchedRun?.totalRawScore).toBe(48.5);
    expect(fetchedRun?.totalNormalizedScore).toBe(52.3);

    const fetchedScores = await adapter.getQuestionScores(run1.evaluationRunId, session.tenantId);
    expect(fetchedScores.length).toBe(2);
    expect(fetchedScores[0].netScore).toBe(2.0);
    expect(fetchedScores[1].netScore).toBe(-0.5);

    // Enforce uniqueness of (exam_session_id, run_iteration = 1)
    const duplicateRun: CandidateEvaluationRunRecord = {
      ...run1,
      evaluationRunId: 'eval_run_v1_duplicate',
      runIteration: 1, // Same iteration!
    };
    await expect(adapter.createEvaluationRun(duplicateRun)).rejects.toThrow(
      DeliveryUniqueConstraintError
    );

    // Iteration 2 (e.g. rescore/superseding) succeeds
    const run2: CandidateEvaluationRunRecord = {
      ...run1,
      evaluationRunId: 'eval_run_v2',
      runIteration: 2,
      supersedesRunId: run1.evaluationRunId,
      totalRawScore: 50.0,
    };
    await adapter.createEvaluationRun(run2);
    const fetchedRun2 = await adapter.getEvaluationRun('eval_run_v2', session.tenantId);
    expect(fetchedRun2).not.toBeNull();
    expect(fetchedRun2?.runIteration).toBe(2);
    expect(fetchedRun2?.supersedesRunId).toBe(run1.evaluationRunId);
  });

  // ==========================================================================
  // Invariant 8: Audit Trail Append & Retrieval
  // ==========================================================================
  it('Inv-8: Audit trail records security events in chronological order', async () => {
    const tenantId = 'tenant_audit_test';
    const audit1: AuditEventRecord = {
      auditEventId: 'audit_001',
      tenantId,
      eventType: 'SESSION_INITIALIZED',
      severity: 'INFO',
      actorType: 'SYSTEM',
      actorId: 'scheduler',
      resourceType: 'EXAM_SESSION',
      resourceId: 'sess_001',
      eventPayload: { detail: 'initialized' },
      recordedAt: new Date(Date.now() - 2000).toISOString(),
    };
    const audit2: AuditEventRecord = {
      auditEventId: 'audit_002',
      tenantId,
      eventType: 'WINDOW_FOCUS_LOST',
      severity: 'WARN',
      actorType: 'CANDIDATE',
      actorId: 'cand_001',
      resourceType: 'CLIENT_PROCTOR',
      resourceId: 'sess_001',
      eventPayload: { blurDurationMs: 450 },
      recordedAt: new Date(Date.now() - 1000).toISOString(),
    };
    const audit3: AuditEventRecord = {
      auditEventId: 'audit_003',
      tenantId,
      eventType: 'SESSION_SUBMITTED',
      severity: 'INFO',
      actorType: 'CANDIDATE',
      actorId: 'cand_001',
      resourceType: 'EXAM_SESSION',
      resourceId: 'sess_001',
      eventPayload: { answersCount: 25 },
      recordedAt: new Date().toISOString(),
    };

    await adapter.recordAuditEvent(audit1);
    await adapter.recordAuditEvent(audit2);
    await adapter.recordAuditEvent(audit3);

    const events = await adapter.getAuditEvents(tenantId);
    expect(events.length).toBe(3);
    // Ordered by recorded_at DESC
    expect(events[0].auditEventId).toBe('audit_003');
    expect(events[1].auditEventId).toBe('audit_002');
    expect(events[2].auditEventId).toBe('audit_001');
  });

  // ==========================================================================
  // Invariant 9: Phase 2 Upstream Invariance
  // ==========================================================================
  it('Inv-9: Delivery database operations leave Phase 2 canonical packages completely unaltered', async () => {
    const client = await pool.connect();
    try {
      const res = await client.query(
        `SELECT package_id, package_integrity_seal, schema_version 
         FROM public.canonical_assessment_packages 
         WHERE package_id = $1`,
        [TEST_PACKAGE_ID]
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].package_id).toBe(TEST_PACKAGE_ID);
      expect(res.rows[0].package_integrity_seal).toBe(TEST_SEAL);
      expect(res.rows[0].schema_version).toBe('1.0.0');
    } finally {
      client.release();
    }
  });
});
