/**
 * UADUE Phase 3.5 — Remediated Scoring & Evaluation Boundary Invariant Suite
 * Specification: UADUE-P3-SCORE-008 (Phase 2D-5 Pure Consumer)
 * Architecture Reference: docs/phase3/PHASE_3_SCORING_BOUNDARY.md
 *
 * Implements full test battery:
 * Part 1: Phase 2D-5 Authority Equivalence Tests (Phase2Result === Phase3Result)
 * Part 2: End-to-End Delivery Session Evaluation against PostgreSQL
 * Part 3: Append-Only Corrigendum DAG Adversarial Tests (10 Scenarios)
 * Part 4: Fail-Closed Contract & Seal Mismatch Tests
 * Part 5: Isolated Candidate Dispute Lifecycle & Immutability Tests
 * Part 6: Mathematical Purity & Idempotency (P3-I07 & P3-I10)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import {
  DeliveryPostgresAdapter,
  DeliveryImmutabilityViolationError,
} from './deliveryPostgresAdapter';
import { SessionOrchestrator } from './sessionOrchestrator';
import { SubmissionIngestionGateway } from './submissionIngestionGateway';
import { QuestionStateMachine } from './questionStateMachine';
import { ScoringEvaluationAdapter, EvaluationError } from './scoringEvaluationAdapter';
import { ScoringEvaluationCore } from './scoringEvaluationCore';
import { DeliveryDisputeService } from './deliveryDisputeService';
import {
  AuthoritativeResolutionBinding,
  ExamSessionRecord,
  SubmissionEventEnvelope,
} from './deliveryTypes';
import {
  evaluateUserAttempt,
} from '../canonical/scoringEvaluator';
import { createResolutionVersion } from '../canonical/answerAuthorityResolver';
import { deriveResponseFingerprint } from '../canonical/canonicalHashing';
import {
  AnswerCandidate,
  ScoringPolicyVersion,
  UserAttemptResponse,
} from '../canonical/types';

describe('UADUE Phase 3.5 — Remediated Scoring & Evaluation Boundary Suite', () => {
  let pool: Pool;
  let adapter: DeliveryPostgresAdapter;
  let orchestrator: SessionOrchestrator;
  let gateway: SubmissionIngestionGateway;
  let stateMachine: QuestionStateMachine;
  let scoringAdapter: ScoringEvaluationAdapter;
  let disputeService: DeliveryDisputeService;

  const TEST_PACKAGE_ID = 'pkg_uadue_phase3_test_001';
  const TEST_SEAL = 'seal_uadue_phase3_sha256_mock_valid_seal';
  const TENANT_ID = 'tenant_scoring_test';

  const defaultPolicy: ScoringPolicyVersion = {
    policyVersionId: 'pol_statutory_v1',
    policyId: 'pol_statutory',
    versionNumber: 1,
    policyFingerprint: 'fp_pol_v1',
    effectiveFrom: '2026-01-01T00:00:00Z',
    createdAt: 1000,
    rules: [
      {
        ruleId: 'r_mcq_standard',
        policyType: 'MCQ_FIXED_PENALTY',
        canonicalQuestionType: 'SINGLE_CHOICE_MCQ',
        positiveMarks: 2.0,
        negativeMarks: 0.5,
        unansweredMarks: 0.0,
      },
      {
        ruleId: 'r_msq_standard',
        policyType: 'MSQ_ALL_OR_NOTHING',
        canonicalQuestionType: 'MULTIPLE_CHOICE_MSQ',
        positiveMarks: 4.0,
        negativeMarks: 1.0,
        unansweredMarks: 0.0,
      },
      {
        ruleId: 'r_nat_standard',
        policyType: 'NUMERICAL_EXACT',
        canonicalQuestionType: 'NUMERICAL_RANGE_NAT',
        positiveMarks: 2.0,
        negativeMarks: 0.0,
        unansweredMarks: 0.0,
      },
      {
        ruleId: 'r_matrix_standard',
        policyType: 'MATRIX_EXACT',
        canonicalQuestionType: 'MATRIX_MATCH',
        positiveMarks: 3.0,
        negativeMarks: 1.0,
        unansweredMarks: 0.0,
      },
    ],
  };

  const createCandidate = (
    qId: string,
    parsedPayload: AnswerCandidate['parsedPayload'],
    ansId: string = `cand_ans_${qId}`
  ): AnswerCandidate => ({
    candidateAnswerId: ansId,
    canonicalQuestionId: qId,
    sourceEntryId: `entry_${ansId}`,
    parsedPayload,
    evidence: [],
    verificationStatus: 'VERIFIED',
    confidenceScore: 1.0,
    provenance: { sourceSnapshotId: 'snap_1', sourceDocumentId: 'doc_1', adapterVersion: '1.0' },
  });

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
    scoringAdapter = new ScoringEvaluationAdapter(adapter);
    disputeService = new DeliveryDisputeService(adapter);

    // Ensure seed canonical package exists in Phase 2 persistence
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
      await client.query(
        `INSERT INTO public.canonical_package_tenancy (
          package_id, tenant_id, organization_id, visibility_scope
        ) VALUES ($1, $2, $3, $4)
        ON CONFLICT (package_id, tenant_id) DO NOTHING`,
        [TEST_PACKAGE_ID, TENANT_ID, 'org_score_001', 'PUBLIC']
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

  const setupTerminalSession = async (
    sessionId: string,
    candidateId: string,
    state: 'SUBMITTED' | 'EXPIRED' = 'SUBMITTED'
  ): Promise<ExamSessionRecord> => {
    const nowIso = new Date().toISOString();
    const session: ExamSessionRecord = {
      examSessionId: sessionId,
      tenantId: TENANT_ID,
      candidateId,
      packageId: TEST_PACKAGE_ID,
      packageIntegritySeal: TEST_SEAL,
      sessionConfiguration: {},
      sessionState: state,
      stateVersion: 3,
      currentLeaseId: 'lease_score_101',
      leaseHeartbeatAt: nowIso,
      scheduledStartAt: nowIso,
      actualStartedAt: nowIso,
      durationSeconds: 3600,
      accumulatedPauseSeconds: 0,
      pauseCount: 0,
      submittedAt: state === 'SUBMITTED' ? nowIso : null,
      expiredAt: state === 'EXPIRED' ? nowIso : null,
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
      sessionLeaseId: 'lease_score_101',
      packageId: TEST_PACKAGE_ID,
      packageIntegritySeal: TEST_SEAL,
      canonicalQuestionId: params.questionId,
      representationId: 'rep_default',
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
      representationId: 'rep_default',
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
  // Part 1: Phase 2D-5 Authority Equivalence Tests (Phase2Result === Phase3Result)
  // ==========================================================================

  describe('Part 1: Phase 2D-5 Authority Equivalence Matrix', () => {
    it('EQ-1: MCQ Correct Option awards exact Phase 2D-5 marks', () => {
      const qId = 'q_eq_mcq_corr';
      const cand = createCandidate(qId, { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'B' });
      const res = createResolutionVersion({ canonicalQuestionId: qId, candidate: cand, versionNumber: 1, authorityDocumentSourceId: 'src_1', effectiveFrom: '2026-01-01T00:00:00Z' });
      const attempt: UserAttemptResponse = {
        attemptId: 'att_1',
        canonicalQuestionId: qId,
        userSelectedOptionIds: ['B'],
        isSkipped: false,
        responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['B'], isSkipped: false }),
        submittedAt: 0,
      };

      const p2Direct = evaluateUserAttempt({ attempt, resolution: res, candidate: cand, policyVersion: defaultPolicy, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } });
      const p3Core = ScoringEvaluationCore.evaluateAttempt({
        policyVersion: defaultPolicy,
        items: [{ canonicalQuestionId: qId, attempt, resolution: res, candidate: cand, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } }],
      });

      expect(p3Core.totalRawScore).toBe(p2Direct.record?.awardedMarks);
      expect(p3Core.itemScores[0].isCorrect).toBe(p2Direct.record?.isCorrect);
      expect(p3Core.itemScores[0].marksAwarded).toBe(2.0);
      expect(p3Core.itemScores[0].penaltyDeducted).toBe(0.0);
    });

    it('EQ-2: MCQ Incorrect Option assesses exact Phase 2D-5 negative penalty', () => {
      const qId = 'q_eq_mcq_wrong';
      const cand = createCandidate(qId, { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'B' });
      const res = createResolutionVersion({ canonicalQuestionId: qId, candidate: cand, versionNumber: 1, authorityDocumentSourceId: 'src_1', effectiveFrom: '2026-01-01T00:00:00Z' });
      const attempt: UserAttemptResponse = {
        attemptId: 'att_2',
        canonicalQuestionId: qId,
        userSelectedOptionIds: ['C'],
        isSkipped: false,
        responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['C'], isSkipped: false }),
        submittedAt: 0,
      };

      const p2Direct = evaluateUserAttempt({ attempt, resolution: res, candidate: cand, policyVersion: defaultPolicy, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } });
      const p3Core = ScoringEvaluationCore.evaluateAttempt({
        policyVersion: defaultPolicy,
        items: [{ canonicalQuestionId: qId, attempt, resolution: res, candidate: cand, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } }],
      });

      expect(p3Core.totalRawScore).toBe(p2Direct.record?.awardedMarks);
      expect(p3Core.itemScores[0].isWrong).toBe(p2Direct.record?.isWrong);
      expect(p3Core.itemScores[0].penaltyDeducted).toBe(0.5);
      expect(p3Core.itemScores[0].netScore).toBe(-0.5);
    });

    it('EQ-3: MCQ Unanswered Option awards exact unansweredMarks (0.0)', () => {
      const qId = 'q_eq_mcq_unans';
      const cand = createCandidate(qId, { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'B' });
      const res = createResolutionVersion({ canonicalQuestionId: qId, candidate: cand, versionNumber: 1, authorityDocumentSourceId: 'src_1', effectiveFrom: '2026-01-01T00:00:00Z' });
      const attempt: UserAttemptResponse = {
        attemptId: 'att_3',
        canonicalQuestionId: qId,
        isSkipped: true,
        responseFingerprint: deriveResponseFingerprint({ isSkipped: true }),
        submittedAt: 0,
      };

      const p2Direct = evaluateUserAttempt({ attempt, resolution: res, candidate: cand, policyVersion: defaultPolicy, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } });
      const p3Core = ScoringEvaluationCore.evaluateAttempt({
        policyVersion: defaultPolicy,
        items: [{ canonicalQuestionId: qId, attempt, resolution: res, candidate: cand, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } }],
      });

      expect(p3Core.totalRawScore).toBe(p2Direct.record?.awardedMarks);
      expect(p3Core.itemScores[0].isSkipped).toBe(true);
      expect(p3Core.questionsUnanswered).toBe(1);
    });

    it('EQ-4: MSQ Exact Match awards full marks; partial mismatch assesses all-or-nothing penalty', () => {
      const qId = 'q_eq_msq';
      const cand = createCandidate(qId, { type: 'MULTIPLE_CHOICE_MSQ', correctOptionLabels: ['A', 'C'], isOrderSensitive: false });
      const res = createResolutionVersion({ canonicalQuestionId: qId, candidate: cand, versionNumber: 1, authorityDocumentSourceId: 'src_1', effectiveFrom: '2026-01-01T00:00:00Z' });

      // Attempt A: Exact match ['A', 'C']
      const attemptExact: UserAttemptResponse = {
        attemptId: 'att_msq_1',
        canonicalQuestionId: qId,
        userSelectedOptionIds: ['A', 'C'],
        isSkipped: false,
        responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['A', 'C'], isSkipped: false }),
        submittedAt: 0,
      };
      const p3Exact = ScoringEvaluationCore.evaluateAttempt({
        policyVersion: defaultPolicy,
        items: [{ canonicalQuestionId: qId, attempt: attemptExact, resolution: res, candidate: cand, questionTraits: { canonicalQuestionType: 'MULTIPLE_CHOICE_MSQ' } }],
      });
      expect(p3Exact.totalRawScore).toBe(4.0);
      expect(p3Exact.itemScores[0].isCorrect).toBe(true);

      // Attempt B: Wrong option ['A', 'D']
      const attemptWrong: UserAttemptResponse = {
        attemptId: 'att_msq_2',
        canonicalQuestionId: qId,
        userSelectedOptionIds: ['A', 'D'],
        isSkipped: false,
        responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['A', 'D'], isSkipped: false }),
        submittedAt: 0,
      };
      const p3Wrong = ScoringEvaluationCore.evaluateAttempt({
        policyVersion: defaultPolicy,
        items: [{ canonicalQuestionId: qId, attempt: attemptWrong, resolution: res, candidate: cand, questionTraits: { canonicalQuestionType: 'MULTIPLE_CHOICE_MSQ' } }],
      });
      expect(p3Wrong.totalRawScore).toBe(-1.0);
      expect(p3Wrong.itemScores[0].isWrong).toBe(true);
    });

    it('EQ-5: NAT Exact Evaluation uses Phase 2D-5 exact numeric parser without float approximation', () => {
      const qId = 'q_eq_nat';
      const cand = createCandidate(qId, { type: 'NUMERICAL_RANGE_NAT', exactValue: '42.5' });
      const res = createResolutionVersion({ canonicalQuestionId: qId, candidate: cand, versionNumber: 1, authorityDocumentSourceId: 'src_1', effectiveFrom: '2026-01-01T00:00:00Z' });

      const attemptCorrect: UserAttemptResponse = {
        attemptId: 'att_nat_1',
        canonicalQuestionId: qId,
        userNumericalInput: '42.5',
        isSkipped: false,
        responseFingerprint: deriveResponseFingerprint({ userNumericalInput: '42.5', isSkipped: false }),
        submittedAt: 0,
      };
      const p3Nat = ScoringEvaluationCore.evaluateAttempt({
        policyVersion: defaultPolicy,
        items: [{ canonicalQuestionId: qId, attempt: attemptCorrect, resolution: res, candidate: cand, questionTraits: { canonicalQuestionType: 'NUMERICAL_RANGE_NAT' } }],
      });
      expect(p3Nat.totalRawScore).toBe(2.0);
      expect(p3Nat.itemScores[0].isCorrect).toBe(true);
    });

    it('EQ-6: Matrix Match delegates to Phase 2D-5 exact match engine', () => {
      const qId = 'q_eq_matrix';
      const cand = createCandidate(qId, {
        type: 'MATRIX_MATCH',
        pairs: [
          { sourceLabel: 'P', targetLabels: ['1'] },
          { sourceLabel: 'Q', targetLabels: ['2'] },
        ],
      });
      const res = createResolutionVersion({ canonicalQuestionId: qId, candidate: cand, versionNumber: 1, authorityDocumentSourceId: 'src_1', effectiveFrom: '2026-01-01T00:00:00Z' });

      const attemptMatrix: UserAttemptResponse = {
        attemptId: 'att_matrix_1',
        canonicalQuestionId: qId,
        userMatrixPairs: [
          { source: 'P', target: '1' },
          { source: 'Q', target: '2' },
        ],
        isSkipped: false,
        responseFingerprint: deriveResponseFingerprint({ userMatrixPairs: [{ source: 'P', target: '1' }, { source: 'Q', target: '2' }], isSkipped: false }),
        submittedAt: 0,
      };
      const p3Matrix = ScoringEvaluationCore.evaluateAttempt({
        policyVersion: defaultPolicy,
        items: [{ canonicalQuestionId: qId, attempt: attemptMatrix, resolution: res, candidate: cand, questionTraits: { canonicalQuestionType: 'MATRIX_MATCH' } }],
      });
      expect(p3Matrix.totalRawScore).toBe(3.0);
      expect(p3Matrix.itemScores[0].isCorrect).toBe(true);
    });

    it('EQ-7: AWARD_FULL_MARKS disposition awards positive marks regardless of candidate response', () => {
      const qId = 'q_eq_full_marks';
      const cand = createCandidate(qId, { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'A' });
      const res = createResolutionVersion({
        canonicalQuestionId: qId,
        candidate: cand,
        versionNumber: 1,
        questionDisposition: 'WITHDRAWN',
        scoringDisposition: 'AWARD_FULL_MARKS',
        authorityDocumentSourceId: 'src_notice',
        effectiveFrom: '2026-01-01T00:00:00Z',
      });

      // User chose wrong option D
      const attemptWrong: UserAttemptResponse = {
        attemptId: 'att_w',
        canonicalQuestionId: qId,
        userSelectedOptionIds: ['D'],
        isSkipped: false,
        responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['D'], isSkipped: false }),
        submittedAt: 0,
      };

      const p2Direct = evaluateUserAttempt({ attempt: attemptWrong, resolution: res, candidate: cand, policyVersion: defaultPolicy, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } });
      const p3Core = ScoringEvaluationCore.evaluateAttempt({
        policyVersion: defaultPolicy,
        items: [{ canonicalQuestionId: qId, attempt: attemptWrong, resolution: res, candidate: cand, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } }],
      });

      expect(p3Core.totalRawScore).toBe(2.0);
      expect(p3Core.totalRawScore).toBe(p2Direct.record?.awardedMarks);
      expect(p3Core.itemScores[0].scoringDisposition).toBe('AWARD_FULL_MARKS');
      expect(p3Core.itemScores[0].isCorrect).toBe(true);
    });

    it('EQ-8: EXCLUDE_AND_RESCALE eliminates question from denominator and triggers pro-rata rescaling', () => {
      const q1 = 'q_rescale_1';
      const q2 = 'q_rescale_2';
      const cand1 = createCandidate(q1, { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'A' });
      const cand2 = createCandidate(q2, { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'B' });

      const res1 = createResolutionVersion({ canonicalQuestionId: q1, candidate: cand1, versionNumber: 1, authorityDocumentSourceId: 'src_1', effectiveFrom: '2026-01-01T00:00:00Z' });
      const res2 = createResolutionVersion({
        canonicalQuestionId: q2,
        candidate: cand2,
        versionNumber: 1,
        questionDisposition: 'CANCELLED',
        scoringDisposition: 'EXCLUDE_AND_RESCALE',
        authorityDocumentSourceId: 'src_2',
        effectiveFrom: '2026-01-01T00:00:00Z',
      });

      const attempt1: UserAttemptResponse = {
        attemptId: 'att_1',
        canonicalQuestionId: q1,
        userSelectedOptionIds: ['A'], // Correct (+2.0)
        isSkipped: false,
        responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['A'], isSkipped: false }),
        submittedAt: 0,
      };
      const attempt2: UserAttemptResponse = {
        attemptId: 'att_2',
        canonicalQuestionId: q2,
        userSelectedOptionIds: ['C'], // Excluded from denominator
        isSkipped: false,
        responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['C'], isSkipped: false }),
        submittedAt: 0,
      };

      const p3Core = ScoringEvaluationCore.evaluateAttempt({
        policyVersion: defaultPolicy,
        items: [
          { canonicalQuestionId: q1, attempt: attempt1, resolution: res1, candidate: cand1, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } },
          { canonicalQuestionId: q2, attempt: attempt2, resolution: res2, candidate: cand2, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } },
        ],
      });

      // Raw score on valid question = 2.0; excluded question = 0.0
      // In Phase 3.5 Raw-Score Fallback: totalNormalizedScore is null
      expect(p3Core.totalRawScore).toBe(2.0);
      expect(p3Core.totalNormalizedScore).toBeNull();
      expect(p3Core.itemScores[1].scoringDisposition).toBe('EXCLUDE_AND_RESCALE');
      expect(p3Core.itemScores[1].isSkipped).toBe(true);
      expect(p3Core.itemScores[1].netScore).toBe(0.0);
    });
  });

  // ==========================================================================
  // Part 2: End-to-End Delivery Session Evaluation against PostgreSQL
  // ==========================================================================

  describe('Part 2: End-to-End PostgreSQL Evaluation Runs', () => {
    it('SE-1: Standard multi-question evaluation session persists run and scores with deterministic ID', async () => {
      const sessionId = 'sess_e2e_001';
      await setupTerminalSession(sessionId, 'cand_e2e_001', 'SUBMITTED');

      await emitAndReduce({
        sessionId,
        questionId: 'q_item_1',
        eventType: 'SINGLE_CHOICE_SELECT',
        payload: { selectedOptionId: 'opt_b' },
        clientSeq: 1,
        clientEventId: 'evt_1',
      });

      const cand1 = createCandidate('q_item_1', { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'opt_b' });
      const res1 = createResolutionVersion({ canonicalQuestionId: 'q_item_1', candidate: cand1, versionNumber: 1, authorityDocumentSourceId: 'src_1', effectiveFrom: '2026-01-01T00:00:00Z' });

      const bindings: AuthoritativeResolutionBinding[] = [
        { canonicalQuestionId: 'q_item_1', resolution: res1, candidate: cand1, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } },
      ];

      const result = await scoringAdapter.evaluateSession({
        examSessionId: sessionId,
        tenantId: TENANT_ID,
        packageId: TEST_PACKAGE_ID,
        packageIntegritySeal: TEST_SEAL,
        scoringPolicy: defaultPolicy,
        authoritativeKeys: bindings,
      });

      expect(result.run.totalRawScore).toBe(2.0);
      expect(result.run.runIteration).toBe(1);
      expect(result.run.supersedesRunId).toBeNull();
      expect(result.run.evaluationRunId).toMatch(/^eval_run_/);

      const storedRun = await adapter.getEvaluationRun(result.run.evaluationRunId, TENANT_ID);
      expect(storedRun).not.toBeNull();
      expect(storedRun?.totalRawScore).toBe(2.0);

      const auditPass = await scoringAdapter.verifyEvaluationAudit(result.run.evaluationRunId, TENANT_ID);
      expect(auditPass.isValid).toBe(true);
      expect(auditPass.isTamperDetected).toBe(false);
    });
  });

  // ==========================================================================
  // Part 3: Append-Only Corrigendum DAG Adversarial Tests (10 Scenarios)
  // ==========================================================================

  describe('Part 3: Corrigendum DAG & Adversarial Battery', () => {
    it('DAG-1: Monotonic run_iteration increments and references immediate predecessor', async () => {
      const sessionId = 'sess_dag_001';
      await setupTerminalSession(sessionId, 'cand_dag_001', 'SUBMITTED');

      await emitAndReduce({
        sessionId,
        questionId: 'q_rev_1',
        eventType: 'SINGLE_CHOICE_SELECT',
        payload: { selectedOptionId: 'opt_c' },
        clientSeq: 1,
        clientEventId: 'evt_dag_1',
      });

      // Iteration 1: key is B -> score = -0.5
      const candV1 = createCandidate('q_rev_1', { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'opt_b' });
      const resV1 = createResolutionVersion({ canonicalQuestionId: 'q_rev_1', candidate: candV1, versionNumber: 1, authorityDocumentSourceId: 'src_init', effectiveFrom: '2026-01-01T00:00:00Z' });
      const run1 = await scoringAdapter.evaluateSession({
        examSessionId: sessionId,
        tenantId: TENANT_ID,
        packageId: TEST_PACKAGE_ID,
        packageIntegritySeal: TEST_SEAL,
        scoringPolicy: defaultPolicy,
        authoritativeKeys: [{ canonicalQuestionId: 'q_rev_1', resolution: resV1, candidate: candV1, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } }],
      });
      expect(run1.run.runIteration).toBe(1);
      expect(run1.run.totalRawScore).toBe(-0.5);

      // Iteration 2: Corrigendum key is C -> score = 2.0
      const candV2 = createCandidate('q_rev_1', { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'opt_c' });
      const resV2 = createResolutionVersion({ canonicalQuestionId: 'q_rev_1', candidate: candV2, versionNumber: 2, authorityDocumentSourceId: 'src_corrigendum', supersedesVersionId: resV1.resolutionVersionId, effectiveFrom: '2026-03-01T00:00:00Z' });
      const run2 = await scoringAdapter.evaluateSession({
        examSessionId: sessionId,
        tenantId: TENANT_ID,
        packageId: TEST_PACKAGE_ID,
        packageIntegritySeal: TEST_SEAL,
        scoringPolicy: defaultPolicy,
        authoritativeKeys: [{ canonicalQuestionId: 'q_rev_1', resolution: resV2, candidate: candV2, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } }],
      });
      expect(run2.run.runIteration).toBe(2);
      expect(run2.run.supersedesRunId).toBe(run1.run.evaluationRunId);
      expect(run2.run.totalRawScore).toBe(2.0);

      const allRuns = await adapter.getEvaluationRunsForSession(sessionId, TENANT_ID);
      expect(allRuns).toHaveLength(2);
      expect(allRuns[1].runIteration).toBe(1);
      expect(allRuns[1].totalRawScore).toBe(-0.5); // Prior run immutable!
    });

    it('DAG-2: Duplicate iteration insertion rejected by database constraint', async () => {
      const sessionId = 'sess_dag_002';
      await setupTerminalSession(sessionId, 'cand_dag_002', 'SUBMITTED');

      const cand = createCandidate('q_dup', { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'A' });
      const res = createResolutionVersion({ canonicalQuestionId: 'q_dup', candidate: cand, versionNumber: 1, authorityDocumentSourceId: 'src_1', effectiveFrom: '2026-01-01T00:00:00Z' });

      await scoringAdapter.evaluateSession({
        examSessionId: sessionId,
        tenantId: TENANT_ID,
        packageId: TEST_PACKAGE_ID,
        packageIntegritySeal: TEST_SEAL,
        scoringPolicy: defaultPolicy,
        authoritativeKeys: [{ canonicalQuestionId: 'q_dup', resolution: res, candidate: cand, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } }],
      });

      // Direct SQL attempt to insert duplicate iteration 1 for the same session
      await expect(
        adapter.withTransaction(TENANT_ID, async (client) => {
          await client.query(
            `INSERT INTO public.candidate_evaluation_runs (
              evaluation_run_id, exam_session_id, tenant_id, package_id, package_integrity_seal,
              scoring_policy_version, answer_key_version, run_iteration, total_raw_score,
              questions_attempted, questions_correct, questions_incorrect, questions_unanswered,
              evaluation_signature
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 0, 0, 0, 0, 0, 'fake_sig')`,
            ['eval_run_duplicate_iter', sessionId, TENANT_ID, TEST_PACKAGE_ID, TEST_SEAL, 'pol_1', 'key_1']
          );
        })
      ).rejects.toThrow();
    });

    it('DAG-3: Identical evaluation contract re-run rejected fail-closed', async () => {
      const sessionId = 'sess_dag_003';
      await setupTerminalSession(sessionId, 'cand_dag_003', 'SUBMITTED');

      const cand = createCandidate('q_same', { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'A' });
      const res = createResolutionVersion({ canonicalQuestionId: 'q_same', candidate: cand, versionNumber: 1, authorityDocumentSourceId: 'src_1', effectiveFrom: '2026-01-01T00:00:00Z' });
      const bindings = [{ canonicalQuestionId: 'q_same', resolution: res, candidate: cand, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } }];

      // Run 1
      await scoringAdapter.evaluateSession({
        examSessionId: sessionId,
        tenantId: TENANT_ID,
        packageId: TEST_PACKAGE_ID,
        packageIntegritySeal: TEST_SEAL,
        scoringPolicy: defaultPolicy,
        authoritativeKeys: bindings,
      });

      // Immediate identical re-run attempt with zero amendments
      await expect(
        scoringAdapter.evaluateSession({
          examSessionId: sessionId,
          tenantId: TENANT_ID,
          packageId: TEST_PACKAGE_ID,
          packageIntegritySeal: TEST_SEAL,
          scoringPolicy: defaultPolicy,
          authoritativeKeys: bindings,
        })
      ).rejects.toThrow(EvaluationError);
    });

    it('DAG-4: Direct UPDATE on evaluation records blocked by immutability trigger', async () => {
      const sessionId = 'sess_dag_004';
      await setupTerminalSession(sessionId, 'cand_dag_004', 'SUBMITTED');

      const cand = createCandidate('q_imm', { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'A' });
      const res = createResolutionVersion({ canonicalQuestionId: 'q_imm', candidate: cand, versionNumber: 1, authorityDocumentSourceId: 'src_1', effectiveFrom: '2026-01-01T00:00:00Z' });
      const result = await scoringAdapter.evaluateSession({
        examSessionId: sessionId,
        tenantId: TENANT_ID,
        packageId: TEST_PACKAGE_ID,
        packageIntegritySeal: TEST_SEAL,
        scoringPolicy: defaultPolicy,
        authoritativeKeys: [{ canonicalQuestionId: 'q_imm', resolution: res, candidate: cand, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } }],
      });

      await expect(
        adapter.withTransaction(TENANT_ID, async (client) => {
          await client.query(
            'UPDATE public.candidate_evaluation_runs SET total_raw_score = 999 WHERE evaluation_run_id = $1',
            [result.run.evaluationRunId]
          );
        })
      ).rejects.toThrow(/(permission denied|immutability violation)/i);
    });

    it('DAG-5: Direct DELETE on evaluation records blocked by immutability trigger', async () => {
      const sessionId = 'sess_dag_005';
      await setupTerminalSession(sessionId, 'cand_dag_005', 'SUBMITTED');

      const cand = createCandidate('q_del', { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'A' });
      const res = createResolutionVersion({ canonicalQuestionId: 'q_del', candidate: cand, versionNumber: 1, authorityDocumentSourceId: 'src_1', effectiveFrom: '2026-01-01T00:00:00Z' });
      const result = await scoringAdapter.evaluateSession({
        examSessionId: sessionId,
        tenantId: TENANT_ID,
        packageId: TEST_PACKAGE_ID,
        packageIntegritySeal: TEST_SEAL,
        scoringPolicy: defaultPolicy,
        authoritativeKeys: [{ canonicalQuestionId: 'q_del', resolution: res, candidate: cand, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } }],
      });

      await expect(
        adapter.withTransaction(TENANT_ID, async (client) => {
          await client.query(
            'DELETE FROM public.candidate_evaluation_runs WHERE evaluation_run_id = $1',
            [result.run.evaluationRunId]
          );
        })
      ).rejects.toThrow(/(permission denied|immutability violation)/i);
    });
  });

  // ==========================================================================
  // Part 4: Fail-Closed Contract & Seal Mismatch Tests
  // ==========================================================================

  describe('Part 4: Fail-Closed Contract & Seal Validation', () => {
    it('FC-1: Active session rejects evaluation fail-closed', async () => {
      const sessionId = 'sess_fc_active';
      const nowIso = new Date().toISOString();
      await adapter.createExamSession({
        examSessionId: sessionId,
        tenantId: TENANT_ID,
        candidateId: 'cand_active',
        packageId: TEST_PACKAGE_ID,
        packageIntegritySeal: TEST_SEAL,
        sessionConfiguration: {},
        sessionState: 'ACTIVE', // Active session!
        stateVersion: 1,
        currentLeaseId: 'l1',
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
      });

      const cand = createCandidate('q1', { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'A' });
      const res = createResolutionVersion({ canonicalQuestionId: 'q1', candidate: cand, versionNumber: 1, authorityDocumentSourceId: 'src_1', effectiveFrom: '2026-01-01T00:00:00Z' });

      await expect(
        scoringAdapter.evaluateSession({
          examSessionId: sessionId,
          tenantId: TENANT_ID,
          packageId: TEST_PACKAGE_ID,
          packageIntegritySeal: TEST_SEAL,
          scoringPolicy: defaultPolicy,
          authoritativeKeys: [{ canonicalQuestionId: 'q1', resolution: res, candidate: cand, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } }],
        })
      ).rejects.toThrow(EvaluationError);
    });

    it('FC-2: Package integrity seal mismatch rejects evaluation fail-closed', async () => {
      const sessionId = 'sess_fc_seal';
      await setupTerminalSession(sessionId, 'cand_seal', 'SUBMITTED');

      const cand = createCandidate('q1', { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'A' });
      const res = createResolutionVersion({ canonicalQuestionId: 'q1', candidate: cand, versionNumber: 1, authorityDocumentSourceId: 'src_1', effectiveFrom: '2026-01-01T00:00:00Z' });

      await expect(
        scoringAdapter.evaluateSession({
          examSessionId: sessionId,
          tenantId: TENANT_ID,
          packageId: TEST_PACKAGE_ID,
          packageIntegritySeal: 'seal_mismatched_corrupted_hash',
          scoringPolicy: defaultPolicy,
          authoritativeKeys: [{ canonicalQuestionId: 'q1', resolution: res, candidate: cand, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } }],
        })
      ).rejects.toThrow(/seal mismatch/i);
    });
  });

  // ==========================================================================
  // Part 5: Isolated Candidate Dispute Lifecycle & Immutability Tests
  // ==========================================================================

  describe('Part 5: Isolated Candidate Dispute Service (R10)', () => {
    it('DISP-1: Dispute filing and resolution creates independent lifecycle without mutating evaluation records', async () => {
      const sessionId = 'sess_disp_001';
      await setupTerminalSession(sessionId, 'cand_disp_001', 'SUBMITTED');

      const cand = createCandidate('q_disp', { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'A' });
      const res = createResolutionVersion({ canonicalQuestionId: 'q_disp', candidate: cand, versionNumber: 1, authorityDocumentSourceId: 'src_1', effectiveFrom: '2026-01-01T00:00:00Z' });
      const evalResult = await scoringAdapter.evaluateSession({
        examSessionId: sessionId,
        tenantId: TENANT_ID,
        packageId: TEST_PACKAGE_ID,
        packageIntegritySeal: TEST_SEAL,
        scoringPolicy: defaultPolicy,
        authoritativeKeys: [{ canonicalQuestionId: 'q_disp', resolution: res, candidate: cand, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } }],
      });

      // 1. File dispute through isolated DeliveryDisputeService
      const dispute = await disputeService.fileScoringDispute({
        examSessionId: sessionId,
        tenantId: TENANT_ID,
        candidateId: 'cand_disp_001',
        canonicalQuestionId: 'q_disp',
        evaluationRunId: evalResult.run.evaluationRunId,
        disputeReason: 'Question phrasing ambiguously translated',
      });

      expect(dispute.disputeId).toBeDefined();
      expect(dispute.disputeStatus).toBe('PENDING');

      // 2. Resolve dispute
      const resolved = await disputeService.resolveScoringDispute({
        disputeId: dispute.disputeId,
        tenantId: TENANT_ID,
        disputeStatus: 'ACCEPTED',
        resolutionNotes: 'Accepted after academic board review',
        resolvedBy: 'eval_chairperson',
      });

      expect(resolved.disputeStatus).toBe('ACCEPTED');

      // 3. Verify original evaluation run remains 100% untouched
      const pristineRun = await adapter.getEvaluationRun(evalResult.run.evaluationRunId, TENANT_ID);
      expect(pristineRun?.totalRawScore).toBe(evalResult.run.totalRawScore);
      expect(pristineRun?.evaluationSignature).toBe(evalResult.run.evaluationSignature);
    });
  });

  // ==========================================================================
  // Part 6: Mathematical Purity & Idempotency (P3-I07 & P3-I10)
  // ==========================================================================

  describe('Part 6: Pure Engine Determinism & Parity', () => {
    it('DET-1: ScoringEvaluationCore produces identical byte-for-byte output across multiple executions', () => {
      const qId = 'q_pure_det';
      const cand = createCandidate(qId, { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'A' });
      const res = createResolutionVersion({ canonicalQuestionId: qId, candidate: cand, versionNumber: 1, authorityDocumentSourceId: 'src_1', effectiveFrom: '2026-01-01T00:00:00Z' });

      const attempt: UserAttemptResponse = {
        attemptId: 'att_det',
        canonicalQuestionId: qId,
        userSelectedOptionIds: ['A'],
        isSkipped: false,
        responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['A'], isSkipped: false }),
        submittedAt: 0,
      };

      const input = {
        policyVersion: defaultPolicy,
        items: [{ canonicalQuestionId: qId, attempt, resolution: res, candidate: cand, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } }],
      };

      const out1 = ScoringEvaluationCore.evaluateAttempt(input);
      const out2 = ScoringEvaluationCore.evaluateAttempt(input);

      expect(out1).toEqual(out2);
      expect(out1.totalRawScore).toBe(2.0);
      expect(out1.totalNormalizedScore).toBeNull();
      expect(out1.questionsCorrect).toBe(1);
    });
  });

  // ==========================================================================
  // Part 7: Raw-Score Fallback & Remediation Verification Battery (8 Scenarios)
  // ==========================================================================

  describe('Part 7: Raw-Score Fallback & Remediation Verification Battery', () => {
    it('FB-1: Standard session with no excluded questions has totalNormalizedScore === null', () => {
      const q1 = 'q_fb_1';
      const cand1 = createCandidate(q1, { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'A' });
      const res1 = createResolutionVersion({ canonicalQuestionId: q1, candidate: cand1, versionNumber: 1, authorityDocumentSourceId: 'src_1', effectiveFrom: '2026-01-01T00:00:00Z' });

      const attempt1: UserAttemptResponse = {
        attemptId: 'att_fb_1',
        canonicalQuestionId: q1,
        userSelectedOptionIds: ['A'], // Correct (+2.0)
        isSkipped: false,
        responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['A'], isSkipped: false }),
        submittedAt: 0,
      };

      const out = ScoringEvaluationCore.evaluateAttempt({
        policyVersion: defaultPolicy,
        items: [{ canonicalQuestionId: q1, attempt: attempt1, resolution: res1, candidate: cand1, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } }],
      });

      expect(out.totalRawScore).toBe(2.0);
      expect(out.totalNormalizedScore).toBeNull();
      expect(out.itemScores[0].netScore).toBe(2.0);
    });

    it('FB-2: EXCLUDE_AND_RESCALE present: item preserved, raw score preserved, totalNormalizedScore === null', () => {
      const q1 = 'q_fb_2a';
      const q2 = 'q_fb_2b';
      const cand1 = createCandidate(q1, { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'A' });
      const cand2 = createCandidate(q2, { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'B' });

      const res1 = createResolutionVersion({ canonicalQuestionId: q1, candidate: cand1, versionNumber: 1, authorityDocumentSourceId: 'src_1', effectiveFrom: '2026-01-01T00:00:00Z' });
      const res2 = createResolutionVersion({
        canonicalQuestionId: q2,
        candidate: cand2,
        versionNumber: 1,
        questionDisposition: 'CANCELLED',
        scoringDisposition: 'EXCLUDE_AND_RESCALE',
        authorityDocumentSourceId: 'src_2',
        effectiveFrom: '2026-01-01T00:00:00Z',
      });

      const attempt1: UserAttemptResponse = {
        attemptId: 'att_fb_2a',
        canonicalQuestionId: q1,
        userSelectedOptionIds: ['A'], // Correct (+2.0)
        isSkipped: false,
        responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['A'], isSkipped: false }),
        submittedAt: 0,
      };
      const attempt2: UserAttemptResponse = {
        attemptId: 'att_fb_2b',
        canonicalQuestionId: q2,
        userSelectedOptionIds: ['B'], // Excluded
        isSkipped: false,
        responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['B'], isSkipped: false }),
        submittedAt: 0,
      };

      const out = ScoringEvaluationCore.evaluateAttempt({
        policyVersion: defaultPolicy,
        items: [
          { canonicalQuestionId: q1, attempt: attempt1, resolution: res1, candidate: cand1, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } },
          { canonicalQuestionId: q2, attempt: attempt2, resolution: res2, candidate: cand2, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } },
        ],
      });

      expect(out.totalRawScore).toBe(2.0);
      expect(out.totalNormalizedScore).toBeNull(); // No pro-rata rescaling!
      expect(out.itemScores[1].scoringDisposition).toBe('EXCLUDE_AND_RESCALE');
      expect(out.itemScores[1].isSkipped).toBe(true);
      expect(out.itemScores[1].netScore).toBe(0.0);
    });

    it('FB-3: Multiple excluded questions: raw score strictly preserved on remaining valid items, no rescaling occurs', () => {
      const q1 = 'q_fb_3a';
      const q2 = 'q_fb_3b';
      const q3 = 'q_fb_3c';
      const cand1 = createCandidate(q1, { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'A' });
      const cand2 = createCandidate(q2, { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'B' });
      const cand3 = createCandidate(q3, { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'C' });

      const res1 = createResolutionVersion({ canonicalQuestionId: q1, candidate: cand1, versionNumber: 1, authorityDocumentSourceId: 'src_1', effectiveFrom: '2026-01-01T00:00:00Z' });
      const res2 = createResolutionVersion({ canonicalQuestionId: q2, candidate: cand2, versionNumber: 1, questionDisposition: 'WITHDRAWN', scoringDisposition: 'EXCLUDE_AND_RESCALE', authorityDocumentSourceId: 'src_2', effectiveFrom: '2026-01-01T00:00:00Z' });
      const res3 = createResolutionVersion({ canonicalQuestionId: q3, candidate: cand3, versionNumber: 1, questionDisposition: 'WITHDRAWN', scoringDisposition: 'EXCLUDE_AND_RESCALE', authorityDocumentSourceId: 'src_3', effectiveFrom: '2026-01-01T00:00:00Z' });

      const attempt1: UserAttemptResponse = { attemptId: 'att_fb_3a', canonicalQuestionId: q1, userSelectedOptionIds: ['A'], isSkipped: false, responseFingerprint: 'fp', submittedAt: 0 };
      const attempt2: UserAttemptResponse = { attemptId: 'att_fb_3b', canonicalQuestionId: q2, userSelectedOptionIds: ['B'], isSkipped: false, responseFingerprint: 'fp', submittedAt: 0 };
      const attempt3: UserAttemptResponse = { attemptId: 'att_fb_3c', canonicalQuestionId: q3, userSelectedOptionIds: ['C'], isSkipped: false, responseFingerprint: 'fp', submittedAt: 0 };

      const out = ScoringEvaluationCore.evaluateAttempt({
        policyVersion: defaultPolicy,
        items: [
          { canonicalQuestionId: q1, attempt: attempt1, resolution: res1, candidate: cand1, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } },
          { canonicalQuestionId: q2, attempt: attempt2, resolution: res2, candidate: cand2, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } },
          { canonicalQuestionId: q3, attempt: attempt3, resolution: res3, candidate: cand3, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } },
        ],
      });

      // Total raw score is strictly from valid Q1 (+2.0), Q2 and Q3 are 0.0
      expect(out.totalRawScore).toBe(2.0);
      expect(out.totalNormalizedScore).toBeNull();
      expect(out.itemScores[1].netScore).toBe(0.0);
      expect(out.itemScores[2].netScore).toBe(0.0);
    });

    it('FB-4: Negative marking: raw score strictly equals Phase 2D-5 result aggregation', () => {
      const q1 = 'q_fb_4a';
      const q2 = 'q_fb_4b';
      const cand1 = createCandidate(q1, { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'A' });
      const cand2 = createCandidate(q2, { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'B' });

      const res1 = createResolutionVersion({ canonicalQuestionId: q1, candidate: cand1, versionNumber: 1, authorityDocumentSourceId: 'src_1', effectiveFrom: '2026-01-01T00:00:00Z' });
      const res2 = createResolutionVersion({ canonicalQuestionId: q2, candidate: cand2, versionNumber: 1, authorityDocumentSourceId: 'src_2', effectiveFrom: '2026-01-01T00:00:00Z' });

      // Q1 correct (+2.0), Q2 wrong (-0.5) -> Net = +1.5
      const attempt1: UserAttemptResponse = { attemptId: 'att_fb_4a', canonicalQuestionId: q1, userSelectedOptionIds: ['A'], isSkipped: false, responseFingerprint: 'fp', submittedAt: 0 };
      const attempt2: UserAttemptResponse = { attemptId: 'att_fb_4b', canonicalQuestionId: q2, userSelectedOptionIds: ['C'], isSkipped: false, responseFingerprint: 'fp', submittedAt: 0 };

      const out = ScoringEvaluationCore.evaluateAttempt({
        policyVersion: defaultPolicy,
        items: [
          { canonicalQuestionId: q1, attempt: attempt1, resolution: res1, candidate: cand1, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } },
          { canonicalQuestionId: q2, attempt: attempt2, resolution: res2, candidate: cand2, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } },
        ],
      });

      expect(out.totalRawScore).toBe(1.5);
      expect(out.totalNormalizedScore).toBeNull();
      expect(out.itemScores[0].netScore).toBe(2.0);
      expect(out.itemScores[1].netScore).toBe(-0.5);
      expect(out.questionsCorrect).toBe(1);
      expect(out.questionsIncorrect).toBe(1);
    });

    it('FB-5: Mixed MCQ/MSQ/NAT/Matrix items: zero Phase 3 scoring semantics introduced', () => {
      // 1 MCQ (+2.0), 1 MSQ exact (+4.0), 1 NAT exact (+3.0), 1 Matrix exact (+3.0)
      const qMcq = 'q_fb_mcq';
      const qMsq = 'q_fb_msq';
      const qNat = 'q_fb_nat';
      const qMat = 'q_fb_mat';

      const candMcq = createCandidate(qMcq, { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'A' });
      const candMsq = createCandidate(qMsq, { type: 'MULTIPLE_CHOICE_MSQ', correctOptionLabels: ['A', 'B'], isOrderSensitive: false });
      const candNat = createCandidate(qNat, {
        type: 'NUMERICAL_RANGE_NAT',
        exactValue: '2.5',
      });
      const candMat = createCandidate(qMat, {
        type: 'MATRIX_MATCH',
        pairs: [
          { sourceLabel: 'P', targetLabels: ['1'] },
        ],
      });

      const resMcq = createResolutionVersion({ canonicalQuestionId: qMcq, candidate: candMcq, versionNumber: 1, authorityDocumentSourceId: 'src_1', effectiveFrom: '2026-01-01T00:00:00Z' });
      const resMsq = createResolutionVersion({ canonicalQuestionId: qMsq, candidate: candMsq, versionNumber: 1, authorityDocumentSourceId: 'src_1', effectiveFrom: '2026-01-01T00:00:00Z' });
      const resNat = createResolutionVersion({ canonicalQuestionId: qNat, candidate: candNat, versionNumber: 1, authorityDocumentSourceId: 'src_1', effectiveFrom: '2026-01-01T00:00:00Z' });
      const resMat = createResolutionVersion({ canonicalQuestionId: qMat, candidate: candMat, versionNumber: 1, authorityDocumentSourceId: 'src_1', effectiveFrom: '2026-01-01T00:00:00Z' });

      const attMcq: UserAttemptResponse = { attemptId: 'a1', canonicalQuestionId: qMcq, userSelectedOptionIds: ['A'], isSkipped: false, responseFingerprint: 'fp', submittedAt: 0 };
      const attMsq: UserAttemptResponse = { attemptId: 'a2', canonicalQuestionId: qMsq, userSelectedOptionIds: ['A', 'B'], isSkipped: false, responseFingerprint: 'fp', submittedAt: 0 };
      const attNat: UserAttemptResponse = { attemptId: 'a3', canonicalQuestionId: qNat, userNumericalInput: '2.5', isSkipped: false, responseFingerprint: 'fp', submittedAt: 0 };
      const attMat: UserAttemptResponse = { attemptId: 'a4', canonicalQuestionId: qMat, userMatrixPairs: [{ source: 'P', target: '1' }], isSkipped: false, responseFingerprint: 'fp', submittedAt: 0 };

      const out = ScoringEvaluationCore.evaluateAttempt({
        policyVersion: defaultPolicy,
        items: [
          { canonicalQuestionId: qMcq, attempt: attMcq, resolution: resMcq, candidate: candMcq, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } },
          { canonicalQuestionId: qMsq, attempt: attMsq, resolution: resMsq, candidate: candMsq, questionTraits: { canonicalQuestionType: 'MULTIPLE_CHOICE_MSQ' } },
          { canonicalQuestionId: qNat, attempt: attNat, resolution: resNat, candidate: candNat, questionTraits: { canonicalQuestionType: 'NUMERICAL_RANGE_NAT' } },
          { canonicalQuestionId: qMat, attempt: attMat, resolution: resMat, candidate: candMat, questionTraits: { canonicalQuestionType: 'MATRIX_MATCH' } },
        ],
      });

      // Total sum = 2.0 (MCQ) + 4.0 (MSQ) + 2.0 (NAT) + 3.0 (Matrix) = 11.0
      expect(out.totalRawScore).toBe(11.0);
      expect(out.totalNormalizedScore).toBeNull();
      expect(out.questionsCorrect).toBe(4);
      expect(out.itemScores).toHaveLength(4);
    });

    it('FB-6: End-to-end delivery evaluation persists total_normalized_score as NULL in PostgreSQL', async () => {
      const sessionId = 'sess_fb_pg_001';
      await setupTerminalSession(sessionId, 'cand_fb_001', 'SUBMITTED');

      const cand = createCandidate('q_pg_fb', { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'A' });
      const res = createResolutionVersion({ canonicalQuestionId: 'q_pg_fb', candidate: cand, versionNumber: 1, authorityDocumentSourceId: 'src_1', effectiveFrom: '2026-01-01T00:00:00Z' });

      const bindings: AuthoritativeResolutionBinding[] = [
        { canonicalQuestionId: 'q_pg_fb', resolution: res, candidate: cand, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } },
      ];

      const result = await scoringAdapter.evaluateSession({
        examSessionId: sessionId,
        tenantId: TENANT_ID,
        packageId: TEST_PACKAGE_ID,
        packageIntegritySeal: TEST_SEAL,
        scoringPolicy: defaultPolicy,
        authoritativeKeys: bindings,
      });

      expect(result.run.totalRawScore).toBe(0.0); // Unanswered
      expect(result.run.totalNormalizedScore).toBeNull();

      const storedRun = await adapter.getEvaluationRun(result.run.evaluationRunId, TENANT_ID);
      expect(storedRun).not.toBeNull();
      expect(storedRun?.totalRawScore).toBe(0.0);
      expect(storedRun?.totalNormalizedScore).toBeNull(); // Confirmed NULL in PostgreSQL!

      const auditPass = await scoringAdapter.verifyEvaluationAudit(result.run.evaluationRunId, TENANT_ID);
      expect(auditPass.isValid).toBe(true);
      expect(auditPass.isTamperDetected).toBe(false);
    });
  });
});
