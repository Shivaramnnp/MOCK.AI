import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { DeliveryPostgresAdapter } from './deliveryPostgresAdapter';
import { ScoringEvaluationAdapter } from './scoringEvaluationAdapter';
import { ScoringEvaluationCore } from './scoringEvaluationCore';
import {
  AnswerAuthorityResolutionVersion,
  AnswerCandidate,
  ScoringPolicyVersion,
  UserAttemptResponse,
} from '../canonical/types';
import { evaluateUserAttempt } from '../canonical/scoringEvaluator';

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:5432/mockai_uadue_test';
const TENANT_ID = 'tenant_forensic_test';

describe('UADUE Phase 3.5 Forensic Hardened Verification', () => {
  let pool: Pool;
  let adapter: DeliveryPostgresAdapter;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });
    adapter = new DeliveryPostgresAdapter(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  // ==========================================================================
  // Section 3: Concurrency Protection on (exam_session_id, run_iteration)
  // ==========================================================================
  describe('Section 3: Corrigendum Concurrency & Unique Constraint Verification', () => {
    it('Concurrent insertion with same run_iteration: exactly one succeeds, other fails with unique violation', async () => {
      const client1 = await pool.connect();
      const client2 = await pool.connect();

      const sessionId = 'sess_concurrent_' + Date.now();
      const packageId = 'pkg_concurrent_' + Date.now();
      const seal = 'seal_concurrent_test';

      try {
        await client1.query("SELECT set_config('app.is_service_role', 'true', false)");
        await client1.query(`
          INSERT INTO public.canonical_assessment_packages (
            package_id, source_snapshot_id, source_document_id, package_integrity_seal,
            schema_version, pipeline_algorithm_id, pipeline_algorithm_version
          ) VALUES ($1, 'snap1', 'doc1', $2, '1.0.0', 'algo1', '1.0.0')
          ON CONFLICT (package_id) DO NOTHING
        `, [packageId, seal]);

        await client1.query(`
          INSERT INTO public.exam_sessions (
            exam_session_id, tenant_id, candidate_id, package_id, package_integrity_seal,
            session_state, current_lease_id, scheduled_start_at, duration_seconds
          ) VALUES ($1, $2, 'cand_c', $3, $4, 'SUBMITTED', 'lease1', now(), 3600)
        `, [sessionId, TENANT_ID, packageId, seal]);

        // Transaction A and Transaction B both start
        await client1.query('BEGIN');
        await client1.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT_ID]);

        await client2.query('BEGIN');
        await client2.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT_ID]);

        // Both attempt to insert run_iteration = 1
        const runIdA = 'eval_run_A_' + Date.now();
        const runIdB = 'eval_run_B_' + Date.now();

        await client1.query(`
          INSERT INTO public.candidate_evaluation_runs (
            evaluation_run_id, exam_session_id, tenant_id, package_id, package_integrity_seal,
            scoring_policy_version, answer_key_version, run_iteration, total_raw_score,
            questions_attempted, questions_correct, questions_incorrect, questions_unanswered,
            evaluation_signature
          ) VALUES ($1, $2, $3, $4, $5, 'pol_1', 'key_1', 1, 10.0, 1, 1, 0, 0, 'sigA')
        `, [runIdA, sessionId, TENANT_ID, packageId, seal]);

        // Client 1 succeeds
        await client1.query('COMMIT');

        // Client 2 attempts insert of identical iteration 1
        let client2Error: any = null;
        try {
          await client2.query(`
            INSERT INTO public.candidate_evaluation_runs (
              evaluation_run_id, exam_session_id, tenant_id, package_id, package_integrity_seal,
              scoring_policy_version, answer_key_version, run_iteration, total_raw_score,
              questions_attempted, questions_correct, questions_incorrect, questions_unanswered,
              evaluation_signature
            ) VALUES ($1, $2, $3, $4, $5, 'pol_1', 'key_1', 1, 10.0, 1, 1, 0, 0, 'sigB')
          `, [runIdB, sessionId, TENANT_ID, packageId, seal]);
          await client2.query('COMMIT');
        } catch (err) {
          client2Error = err;
          await client2.query('ROLLBACK');
        }

        expect(client2Error).not.toBeNull();
        expect(client2Error.code).toBe('23505'); // PostgreSQL unique_violation
        expect(client2Error.message).toContain('uq_session_run_iteration');
      } finally {
        client1.release();
        client2.release();
      }
    });
  });

  // ==========================================================================
  // Section 8: Database Immutability Triggers
  // ==========================================================================
  describe('Section 8: Database Immutability Triggers on Evaluation Tables', () => {
    it('Blocks direct UPDATE and DELETE on candidate_evaluation_runs via trigger', async () => {
      const client = await pool.connect();
      const sessionId = 'sess_imm_eval_' + Date.now();
      const packageId = 'pkg_imm_eval_' + Date.now();
      const seal = 'seal_imm_eval';
      const runId = 'eval_run_imm_' + Date.now();

      try {
        await client.query("SELECT set_config('app.is_service_role', 'true', false)");
        await client.query(`
          INSERT INTO public.canonical_assessment_packages (
            package_id, source_snapshot_id, source_document_id, package_integrity_seal,
            schema_version, pipeline_algorithm_id, pipeline_algorithm_version
          ) VALUES ($1, 'snap1', 'doc1', $2, '1.0.0', 'algo1', '1.0.0')
          ON CONFLICT (package_id) DO NOTHING
        `, [packageId, seal]);
        await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT_ID]);

        await client.query(`
          INSERT INTO public.exam_sessions (
            exam_session_id, tenant_id, candidate_id, package_id, package_integrity_seal,
            session_state, current_lease_id, scheduled_start_at, duration_seconds
          ) VALUES ($1, $2, 'cand_imm', $3, $4, 'SUBMITTED', 'lease1', now(), 3600)
        `, [sessionId, TENANT_ID, packageId, seal]);

        await client.query(`
          INSERT INTO public.candidate_evaluation_runs (
            evaluation_run_id, exam_session_id, tenant_id, package_id, package_integrity_seal,
            scoring_policy_version, answer_key_version, run_iteration, total_raw_score,
            questions_attempted, questions_correct, questions_incorrect, questions_unanswered,
            evaluation_signature
          ) VALUES ($1, $2, $3, $4, $5, 'pol_1', 'key_1', 1, 10.0, 1, 1, 0, 0, 'sig')
        `, [runId, sessionId, TENANT_ID, packageId, seal]);

        // Attempt UPDATE
        let updateErr: any = null;
        try {
          await client.query('UPDATE public.candidate_evaluation_runs SET total_raw_score = 999 WHERE evaluation_run_id = $1', [runId]);
        } catch (e) {
          updateErr = e;
        }
        expect(updateErr).not.toBeNull();
        expect(updateErr.code).toBe('P0001');
        expect(updateErr.message).toContain('UADUE Immutability Violation');

        // Attempt DELETE
        let deleteErr: any = null;
        try {
          await client.query('DELETE FROM public.candidate_evaluation_runs WHERE evaluation_run_id = $1', [runId]);
        } catch (e) {
          deleteErr = e;
        }
        expect(deleteErr).not.toBeNull();
        expect(deleteErr.code).toBe('P0001');
        expect(deleteErr.message).toContain('UADUE Immutability Violation');
      } finally {
        client.release();
      }
    });

    it('Blocks direct UPDATE and DELETE on candidate_question_scores via trigger', async () => {
      const client = await pool.connect();
      const sessionId = 'sess_imm_qs_' + Date.now();
      const packageId = 'pkg_imm_qs_' + Date.now();
      const seal = 'seal_imm_qs';
      const runId = 'eval_run_qs_' + Date.now();
      const scoreId = 'score_qs_' + Date.now();

      try {
        await client.query("SELECT set_config('app.is_service_role', 'true', false)");
        await client.query(`
          INSERT INTO public.canonical_assessment_packages (
            package_id, source_snapshot_id, source_document_id, package_integrity_seal,
            schema_version, pipeline_algorithm_id, pipeline_algorithm_version
          ) VALUES ($1, 'snap1', 'doc1', $2, '1.0.0', 'algo1', '1.0.0')
          ON CONFLICT (package_id) DO NOTHING
        `, [packageId, seal]);
        await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT_ID]);

        await client.query(`
          INSERT INTO public.exam_sessions (
            exam_session_id, tenant_id, candidate_id, package_id, package_integrity_seal,
            session_state, current_lease_id, scheduled_start_at, duration_seconds
          ) VALUES ($1, $2, 'cand_imm_qs', $3, $4, 'SUBMITTED', 'lease1', now(), 3600)
        `, [sessionId, TENANT_ID, packageId, seal]);

        await client.query(`
          INSERT INTO public.candidate_evaluation_runs (
            evaluation_run_id, exam_session_id, tenant_id, package_id, package_integrity_seal,
            scoring_policy_version, answer_key_version, run_iteration, total_raw_score,
            questions_attempted, questions_correct, questions_incorrect, questions_unanswered,
            evaluation_signature
          ) VALUES ($1, $2, $3, $4, $5, 'pol_1', 'key_1', 1, 10.0, 1, 1, 0, 0, 'sig')
        `, [runId, sessionId, TENANT_ID, packageId, seal]);

        await client.query(`
          INSERT INTO public.candidate_question_scores (
            question_score_id, evaluation_run_id, tenant_id, canonical_question_id,
            is_correct, marks_awarded, penalty_deducted, net_score
          ) VALUES ($1, $2, $3, 'q1', true, 2.0, 0.0, 2.0)
        `, [scoreId, runId, TENANT_ID]);

        // Attempt UPDATE
        let updateErr: any = null;
        try {
          await client.query('UPDATE public.candidate_question_scores SET marks_awarded = 50 WHERE question_score_id = $1', [scoreId]);
        } catch (e) {
          updateErr = e;
        }
        expect(updateErr).not.toBeNull();
        expect(updateErr.code).toBe('P0001');
        expect(updateErr.message).toContain('UADUE Immutability Violation');

        // Attempt DELETE
        let deleteErr: any = null;
        try {
          await client.query('DELETE FROM public.candidate_question_scores WHERE question_score_id = $1', [scoreId]);
        } catch (e) {
          deleteErr = e;
        }
        expect(deleteErr).not.toBeNull();
        expect(deleteErr.code).toBe('P0001');
        expect(deleteErr.message).toContain('UADUE Immutability Violation');
      } finally {
        client.release();
      }
    });
  });

  // ==========================================================================
  // Section 5: Authority Equivalence Across Full Matrix
  // ==========================================================================
  describe('Section 5: Strict Authority Equivalence (Phase 2D-5 vs Phase 3.5 Core)', () => {
    const policyVersion: ScoringPolicyVersion = {
      policyVersionId: 'pol_equiv_v1',
      policyId: 'pol_equiv',
      versionNumber: 1,
      policyFingerprint: 'fp',
      effectiveFrom: '2026-01-01T00:00:00Z',
      createdAt: 0,
      rules: [
        {
          ruleId: 'r_mcq',
          policyType: 'MCQ_FIXED_PENALTY',
          canonicalQuestionType: 'SINGLE_CHOICE_MCQ',
          positiveMarks: 2.0,
          negativeMarks: 0.5,
          unansweredMarks: 0.0,
        },
        {
          ruleId: 'r_msq',
          policyType: 'MSQ_ALL_OR_NOTHING',
          canonicalQuestionType: 'MULTIPLE_CHOICE_MSQ',
          positiveMarks: 4.0,
          negativeMarks: 1.0,
          unansweredMarks: 0.0,
        },
        {
          ruleId: 'r_nat',
          policyType: 'NUMERICAL_EXACT',
          canonicalQuestionType: 'NUMERICAL_VALUE',
          positiveMarks: 3.0,
          negativeMarks: 0.0,
          unansweredMarks: 0.0,
        },
        {
          ruleId: 'r_mat',
          policyType: 'MATRIX_EXACT',
          canonicalQuestionType: 'MATRIX_MATCH',
          positiveMarks: 4.0,
          negativeMarks: 1.0,
          unansweredMarks: 0.0,
        },
      ],
    };

    function testEquivalence(
      name: string,
      traits: { canonicalQuestionType: string },
      attempt: UserAttemptResponse,
      cand: AnswerCandidate,
      res: AnswerAuthorityResolutionVersion
    ) {
      it(`Equivalence test: ${name}`, () => {
        // Direct Phase 2D-5 evaluation
        const phase2Outcome = evaluateUserAttempt({
          attempt,
          resolution: res,
          candidate: cand,
          policyVersion,
          questionTraits: traits,
          evaluatedAt: 0,
        });
        expect(phase2Outcome.isEvaluated).toBe(true);
        const p2Rec = phase2Outcome.record!;

        // Phase 3.5 Pure Core evaluation
        const coreOutput = ScoringEvaluationCore.evaluateAttempt({
          policyVersion,
          items: [
            {
              canonicalQuestionId: attempt.canonicalQuestionId,
              attempt,
              resolution: res,
              candidate: cand,
              questionTraits: traits,
            },
          ],
        });
        expect(coreOutput.itemScores).toHaveLength(1);
        const p3Item = coreOutput.itemScores[0];

        // Verify zero reinterpretation of item-level properties
        expect(p3Item.isCorrect).toBe(p2Rec.isCorrect);
        expect(p3Item.isPartiallyCorrect).toBe(p2Rec.isPartial);
        expect(p3Item.isWrong).toBe(p2Rec.isWrong);
        expect(p3Item.isSkipped).toBe(p2Rec.isSkipped);
        expect(p3Item.netScore).toBe(p2Rec.awardedMarks);
        expect(p3Item.scoringDisposition).toBe(p2Rec.scoringDisposition);
        expect(p3Item.questionDisposition).toBe(p2Rec.questionDisposition);
        expect(p3Item.selectedRuleId).toBe(p2Rec.selectedRuleId);
        expect(p3Item.evaluationLog).toEqual(p2Rec.evaluationLog);
      });
    }

    // MCQ Cases
    const candMcq: AnswerCandidate = {
      candidateAnswerId: 'c_mcq',
      canonicalQuestionId: 'q_mcq',
      sourceEntryId: 'src_1',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'B' },
      evidence: [],
      verificationStatus: 'VERIFIED',
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };
    const resMcq: AnswerAuthorityResolutionVersion = {
      resolutionVersionId: 'res_mcq_1',
      resolutionFamilyId: 'fam_mcq',
      versionNumber: 1,
      canonicalQuestionId: 'q_mcq',
      candidateAnswerId: 'c_mcq',
      verificationStatus: 'VERIFIED',
      questionDisposition: 'ACTIVE',
      scoringDisposition: 'STANDARD_EVALUATION',
      authorityDocumentSourceId: 'doc_1',
      supersedesVersionId: null,
      effectiveFrom: '2026-01-01T00:00:00Z',
      createdAt: 0,
    };

    testEquivalence(
      'MCQ Correct Attempt',
      { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' },
      { attemptId: 'a1', canonicalQuestionId: 'q_mcq', userSelectedOptionIds: ['B'], isSkipped: false, responseFingerprint: 'fp', submittedAt: 0 },
      candMcq,
      resMcq
    );

    testEquivalence(
      'MCQ Wrong Attempt',
      { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' },
      { attemptId: 'a2', canonicalQuestionId: 'q_mcq', userSelectedOptionIds: ['A'], isSkipped: false, responseFingerprint: 'fp', submittedAt: 0 },
      candMcq,
      resMcq
    );

    testEquivalence(
      'MCQ Unanswered Attempt',
      { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' },
      { attemptId: 'a3', canonicalQuestionId: 'q_mcq', userSelectedOptionIds: [], isSkipped: true, responseFingerprint: 'fp', submittedAt: 0 },
      candMcq,
      resMcq
    );

    // Statutory Dispositions
    const resBonus: AnswerAuthorityResolutionVersion = {
      ...resMcq,
      resolutionVersionId: 'res_bonus',
      questionDisposition: 'ACTIVE',
      scoringDisposition: 'AWARD_FULL_MARKS',
    };
    testEquivalence(
      'AWARD_FULL_MARKS Disposition',
      { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' },
      { attemptId: 'a4', canonicalQuestionId: 'q_mcq', userSelectedOptionIds: ['C'], isSkipped: false, responseFingerprint: 'fp', submittedAt: 0 },
      candMcq,
      resBonus
    );

    const resExclude: AnswerAuthorityResolutionVersion = {
      ...resMcq,
      resolutionVersionId: 'res_exclude',
      questionDisposition: 'WITHDRAWN',
      scoringDisposition: 'EXCLUDE_AND_RESCALE',
    };
    testEquivalence(
      'EXCLUDE_AND_RESCALE Disposition',
      { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' },
      { attemptId: 'a5', canonicalQuestionId: 'q_mcq', userSelectedOptionIds: ['B'], isSkipped: false, responseFingerprint: 'fp', submittedAt: 0 },
      candMcq,
      resExclude
    );

    const resZero: AnswerAuthorityResolutionVersion = {
      ...resMcq,
      resolutionVersionId: 'res_zero',
      questionDisposition: 'CANCELLED',
      scoringDisposition: 'ZERO_MARKS',
    };
    testEquivalence(
      'ZERO_MARKS Disposition',
      { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' },
      { attemptId: 'a6', canonicalQuestionId: 'q_mcq', userSelectedOptionIds: ['B'], isSkipped: false, responseFingerprint: 'fp', submittedAt: 0 },
      candMcq,
      resZero
    );
  });
});
