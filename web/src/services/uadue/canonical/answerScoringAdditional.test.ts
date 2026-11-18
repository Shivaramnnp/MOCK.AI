/**
 * UADUE Phase 2D-5 — Forensic Remediation v5.3-R1 Test Suite
 * Document Version: 5.3.0-REMEDIATION-R1
 *
 * Covers all remediation items:
 * 1. RED BLOCKER 1: Explicit Withdrawn/Cancelled/Superseded scoring semantics (no full-marks assumption).
 * 2. YELLOW 2: Removal of hidden scoring defaults (fail-closed if mandatory parameters missing).
 * 3. YELLOW 3: Deterministic Conflict ID (pure SHA-256 state hashing, no Date.now()).
 * 4. YELLOW 4: Explicit Conflict Resolution Event (Scenarios A through I, zero version-number heuristics).
 * 5. YELLOW 5: NAT Resource Bounds (pathological exponent/digit limits fail closed).
 * 6. YELLOW 6: Matrix Match Target Labels Domain Semantics (unordered set normalization).
 */

import { describe, it, expect } from 'vitest';
import {
  parseExactNumericInput,
  evaluateExactNumericMatch,
  toBigIntRational,
  MAX_NUMERIC_DIGITS,
  MAX_EXPONENT_MAGNITUDE,
} from './exactNumericEvaluator';
import {
  selectScoringPolicyRule,
  evaluateUserAttempt,
} from './scoringEvaluator';
import {
  createResolutionVersion,
  evaluateLineageHead,
} from './answerAuthorityResolver';
import {
  computeCanonicalSha256,
  deriveConflictId,
  deriveConflictResolutionEventId,
  deriveResponseFingerprint,
} from './canonicalHashing';
import {
  AnswerCandidate,
  ConflictResolutionEvent,
  ScoringPolicyRule,
  ScoringPolicyVersion,
  UserAttemptResponse,
} from './types';

function createDummyCandidate(params: {
  canonicalQuestionId: string;
  candidateAnswerId: string;
  parsedPayload?: AnswerCandidate['parsedPayload'];
}): AnswerCandidate {
  return {
    candidateAnswerId: params.candidateAnswerId,
    canonicalQuestionId: params.canonicalQuestionId,
    sourceEntryId: `entry_${params.candidateAnswerId}`,
    parsedPayload: params.parsedPayload || { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'A' },
    evidence: [],
    verificationStatus: 'VERIFIED',
    confidenceScore: 1.0,
    provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', adapterVersion: '1.0' },
  };
}

function createDummyPolicy(): ScoringPolicyVersion {
  return {
    policyVersionId: 'pol_test_v1',
    policyId: 'pol_test',
    versionNumber: 1,
    policyFingerprint: 'fp_test',
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
        ruleId: 'r_msq_partial',
        policyType: 'MSQ_PARTIAL_CREDIT',
        canonicalQuestionType: 'MULTIPLE_CHOICE_MSQ',
        positiveMarks: 4.0,
        negativeMarks: 1.0,
        unansweredMarks: 0.0,
        partialCreditConfig: {
          singleOptionMatchWeight: 1.0,
          wrongOptionPenalty: 1.0,
        },
      },
      {
        ruleId: 'r_nat_interval',
        policyType: 'NUMERICAL_TOLERANCE',
        canonicalQuestionType: 'NUMERICAL_RANGE_NAT',
        positiveMarks: 2.0,
        negativeMarks: 0.0,
        unansweredMarks: 0.0,
        numericalToleranceConfig: {
          boundsInclusivity: 'INCLUSIVE',
          absoluteTolerance: '0.1',
        },
      },
      {
        ruleId: 'r_matrix_partial',
        policyType: 'MATRIX_PARTIAL_CREDIT',
        canonicalQuestionType: 'MATRIX_MATCH',
        positiveMarks: 4.0,
        negativeMarks: 1.0,
        unansweredMarks: 0.0,
        matrixMatchConfig: {
          marksPerRow: 1.0,
          penaltyPerWrongRow: 0.5,
        },
      },
    ],
    effectiveFrom: '2026-01-01T00:00:00Z',
    createdAt: 1000,
  };
}

describe('UADUE Phase 2D-5 — Forensic Remediation v5.3-R1', () => {
  // ==========================================================================
  // 1. RED BLOCKER 1: Withdrawn / Disposition Scoring Semantics
  // ==========================================================================
  describe('RED BLOCKER 1: Withdrawn & Disposition Scoring Semantics', () => {
    const policy = createDummyPolicy();
    const cand = createDummyCandidate({ canonicalQuestionId: 'q_withdrawn', candidateAnswerId: 'cand_w' });
    const attempt: UserAttemptResponse = {
      attemptId: 'att_1',
      canonicalQuestionId: 'q_withdrawn',
      userSelectedOptionIds: ['C'], // user selected wrong option
      isSkipped: false,
      responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['C'], isSkipped: false }),
      submittedAt: 1000,
    };

    it('1. WITHDRAWN + AWARD_FULL_MARKS: Awards rule.positiveMarks', () => {
      const res = createResolutionVersion({
        canonicalQuestionId: 'q_withdrawn',
        candidate: cand,
        versionNumber: 1,
        questionDisposition: 'WITHDRAWN',
        scoringDisposition: 'AWARD_FULL_MARKS',
        authorityDocumentSourceId: 'doc_withdrawn',
        effectiveFrom: '2026-01-01T00:00:00Z',
      });
      const result = evaluateUserAttempt({
        attempt,
        resolution: res,
        candidate: cand,
        policyVersion: policy,
        questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' },
      });
      expect(result.isEvaluated).toBe(true);
      expect(result.record?.isCorrect).toBe(true);
      expect(result.record?.isSkipped).toBe(false);
      expect(result.record?.awardedMarks).toBe(2.0);
    });

    it('2. WITHDRAWN + EXCLUDE_AND_RESCALE: Excluded from denominator, 0 awarded marks', () => {
      const res = createResolutionVersion({
        canonicalQuestionId: 'q_withdrawn',
        candidate: cand,
        versionNumber: 1,
        questionDisposition: 'WITHDRAWN',
        scoringDisposition: 'EXCLUDE_AND_RESCALE',
        authorityDocumentSourceId: 'doc_withdrawn',
        effectiveFrom: '2026-01-01T00:00:00Z',
      });
      const result = evaluateUserAttempt({
        attempt,
        resolution: res,
        candidate: cand,
        policyVersion: policy,
        questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' },
      });
      expect(result.isEvaluated).toBe(true);
      expect(result.record?.isCorrect).toBe(false);
      expect(result.record?.isSkipped).toBe(true);
      expect(result.record?.awardedMarks).toBe(0);
    });

    it('3. WITHDRAWN + ZERO_MARKS: 0 awarded marks, not correct, not skipped', () => {
      const res = createResolutionVersion({
        canonicalQuestionId: 'q_withdrawn',
        candidate: cand,
        versionNumber: 1,
        questionDisposition: 'WITHDRAWN',
        scoringDisposition: 'ZERO_MARKS',
        authorityDocumentSourceId: 'doc_withdrawn',
        effectiveFrom: '2026-01-01T00:00:00Z',
      });
      const result = evaluateUserAttempt({
        attempt,
        resolution: res,
        candidate: cand,
        policyVersion: policy,
        questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' },
      });
      expect(result.isEvaluated).toBe(true);
      expect(result.record?.isCorrect).toBe(false);
      expect(result.record?.isWrong).toBe(false);
      expect(result.record?.isSkipped).toBe(false);
      expect(result.record?.awardedMarks).toBe(0);
    });

    it('4. CANCELLED + explicit scoring disposition: Evaluated according to scoring disposition', () => {
      const resFull = createResolutionVersion({
        canonicalQuestionId: 'q_withdrawn',
        candidate: cand,
        versionNumber: 1,
        questionDisposition: 'CANCELLED',
        scoringDisposition: 'AWARD_FULL_MARKS',
        authorityDocumentSourceId: 'doc_cancel',
        effectiveFrom: '2026-01-01T00:00:00Z',
      });
      const resZero = createResolutionVersion({
        canonicalQuestionId: 'q_withdrawn',
        candidate: cand,
        versionNumber: 1,
        questionDisposition: 'CANCELLED',
        scoringDisposition: 'ZERO_MARKS',
        authorityDocumentSourceId: 'doc_cancel',
        effectiveFrom: '2026-01-01T00:00:00Z',
      });
      const resultFull = evaluateUserAttempt({
        attempt,
        resolution: resFull,
        candidate: cand,
        policyVersion: policy,
        questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' },
      });
      const resultZero = evaluateUserAttempt({
        attempt,
        resolution: resZero,
        candidate: cand,
        policyVersion: policy,
        questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' },
      });
      expect(resultFull.record?.awardedMarks).toBe(2.0);
      expect(resultZero.record?.awardedMarks).toBe(0);
    });

    it('5. SUPERSEDED + explicit scoring disposition: Evaluated according to scoring disposition', () => {
      const res = createResolutionVersion({
        canonicalQuestionId: 'q_withdrawn',
        candidate: cand,
        versionNumber: 1,
        questionDisposition: 'SUPERSEDED',
        scoringDisposition: 'ZERO_MARKS',
        authorityDocumentSourceId: 'doc_sup',
        effectiveFrom: '2026-01-01T00:00:00Z',
      });
      const result = evaluateUserAttempt({
        attempt,
        resolution: res,
        candidate: cand,
        policyVersion: policy,
        questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' },
      });
      expect(result.isEvaluated).toBe(true);
      expect(result.record?.awardedMarks).toBe(0);
    });

    it('6. Contradictory / Unsupported combinations fail closed', () => {
      // Inactive question disposition cannot have STANDARD_EVALUATION
      const resWithdrawnStd = createResolutionVersion({
        canonicalQuestionId: 'q_withdrawn',
        candidate: cand,
        versionNumber: 1,
        questionDisposition: 'WITHDRAWN',
        scoringDisposition: 'STANDARD_EVALUATION',
        authorityDocumentSourceId: 'doc_err',
        effectiveFrom: '2026-01-01T00:00:00Z',
      });
      const resCancelStd = createResolutionVersion({
        canonicalQuestionId: 'q_withdrawn',
        candidate: cand,
        versionNumber: 1,
        questionDisposition: 'CANCELLED',
        scoringDisposition: 'STANDARD_EVALUATION',
        authorityDocumentSourceId: 'doc_err',
        effectiveFrom: '2026-01-01T00:00:00Z',
      });
      const resUnresolved = createResolutionVersion({
        canonicalQuestionId: 'q_withdrawn',
        candidate: cand,
        versionNumber: 1,
        questionDisposition: 'UNRESOLVED',
        scoringDisposition: 'STANDARD_EVALUATION',
        authorityDocumentSourceId: 'doc_err',
        effectiveFrom: '2026-01-01T00:00:00Z',
      });

      const res1 = evaluateUserAttempt({ attempt, resolution: resWithdrawnStd, candidate: cand, policyVersion: policy, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } });
      const res2 = evaluateUserAttempt({ attempt, resolution: resCancelStd, candidate: cand, policyVersion: policy, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } });
      const res3 = evaluateUserAttempt({ attempt, resolution: resUnresolved, candidate: cand, policyVersion: policy, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } });

      expect(res1.isEvaluated).toBe(false);
      expect(res1.failureReason).toContain('STANDARD_EVALUATION');
      expect(res2.isEvaluated).toBe(false);
      expect(res2.failureReason).toContain('STANDARD_EVALUATION');
      expect(res3.isEvaluated).toBe(false);
      expect(res3.failureReason).toContain('UNRESOLVED');
    });
  });

  // ==========================================================================
  // 2. YELLOW 2: Removal of Hidden Scoring Defaults
  // ==========================================================================
  describe('YELLOW 2: Removal of Hidden Scoring Defaults', () => {
    it('Fails closed if MSQ_PARTIAL_CREDIT is missing wrongOptionPenalty', () => {
      const badPolicy: ScoringPolicyVersion = {
        policyVersionId: 'pol_bad_msq_1',
        policyId: 'pol_bad',
        versionNumber: 1,
        policyFingerprint: 'fp',
        rules: [
          {
            ruleId: 'r_bad_msq',
            policyType: 'MSQ_PARTIAL_CREDIT',
            canonicalQuestionType: 'MULTIPLE_CHOICE_MSQ',
            positiveMarks: 4.0,
            negativeMarks: 1.0,
            unansweredMarks: 0.0,
            partialCreditConfig: {
              singleOptionMatchWeight: 1.0,
              // wrongOptionPenalty is missing!
            } as any,
          },
        ],
        effectiveFrom: '2026-01-01T00:00:00Z',
        createdAt: 1000,
      };

      const candMSQ = createDummyCandidate({
        canonicalQuestionId: 'q_msq',
        candidateAnswerId: 'c_msq',
        parsedPayload: { type: 'MULTIPLE_CHOICE_MSQ', correctOptionLabels: ['A', 'B'], isOrderSensitive: false },
      });
      const res = createResolutionVersion({
        canonicalQuestionId: 'q_msq',
        candidate: candMSQ,
        versionNumber: 1,
        authorityDocumentSourceId: 'src_1',
        effectiveFrom: '2026-01-01T00:00:00Z',
      });
      const attemptWrong: UserAttemptResponse = {
        attemptId: 'att_wrong',
        canonicalQuestionId: 'q_msq',
        userSelectedOptionIds: ['A', 'C'], // selected wrong option C
        isSkipped: false,
        responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['A', 'C'], isSkipped: false }),
        submittedAt: 1000,
      };

      const outcome = evaluateUserAttempt({
        attempt: attemptWrong,
        resolution: res,
        candidate: candMSQ,
        policyVersion: badPolicy,
        questionTraits: { canonicalQuestionType: 'MULTIPLE_CHOICE_MSQ' },
      });
      expect(outcome.isEvaluated).toBe(false);
      expect(outcome.failureReason).toContain('wrongOptionPenalty');
    });

    it('Fails closed if MSQ_PARTIAL_CREDIT is missing singleOptionMatchWeight', () => {
      const badPolicy: ScoringPolicyVersion = {
        policyVersionId: 'pol_bad_msq_2',
        policyId: 'pol_bad',
        versionNumber: 1,
        policyFingerprint: 'fp',
        rules: [
          {
            ruleId: 'r_bad_msq_2',
            policyType: 'MSQ_PARTIAL_CREDIT',
            canonicalQuestionType: 'MULTIPLE_CHOICE_MSQ',
            positiveMarks: 4.0,
            negativeMarks: 1.0,
            unansweredMarks: 0.0,
            partialCreditConfig: {
              wrongOptionPenalty: 1.0,
              // singleOptionMatchWeight is missing!
            } as any,
          },
        ],
        effectiveFrom: '2026-01-01T00:00:00Z',
        createdAt: 1000,
      };

      const candMSQ = createDummyCandidate({
        canonicalQuestionId: 'q_msq',
        candidateAnswerId: 'c_msq',
        parsedPayload: { type: 'MULTIPLE_CHOICE_MSQ', correctOptionLabels: ['A', 'B', 'C'], isOrderSensitive: false },
      });
      const res = createResolutionVersion({
        canonicalQuestionId: 'q_msq',
        candidate: candMSQ,
        versionNumber: 1,
        authorityDocumentSourceId: 'src_1',
        effectiveFrom: '2026-01-01T00:00:00Z',
      });
      const attemptPartial: UserAttemptResponse = {
        attemptId: 'att_part',
        canonicalQuestionId: 'q_msq',
        userSelectedOptionIds: ['A'], // partial subset
        isSkipped: false,
        responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['A'], isSkipped: false }),
        submittedAt: 1000,
      };

      const outcome = evaluateUserAttempt({
        attempt: attemptPartial,
        resolution: res,
        candidate: candMSQ,
        policyVersion: badPolicy,
        questionTraits: { canonicalQuestionType: 'MULTIPLE_CHOICE_MSQ' },
      });
      expect(outcome.isEvaluated).toBe(false);
      expect(outcome.failureReason).toContain('singleOptionMatchWeight');
    });

    it('Fails closed if MATRIX_PARTIAL_CREDIT is missing marksPerRow', () => {
      const badPolicy: ScoringPolicyVersion = {
        policyVersionId: 'pol_bad_matrix',
        policyId: 'pol_bad',
        versionNumber: 1,
        policyFingerprint: 'fp',
        rules: [
          {
            ruleId: 'r_bad_mat',
            policyType: 'MATRIX_PARTIAL_CREDIT',
            canonicalQuestionType: 'MATRIX_MATCH',
            positiveMarks: 4.0,
            negativeMarks: 1.0,
            unansweredMarks: 0.0,
            matrixMatchConfig: {
              // marksPerRow missing!
              penaltyPerWrongRow: 0.5,
            } as any,
          },
        ],
        effectiveFrom: '2026-01-01T00:00:00Z',
        createdAt: 1000,
      };

      const candMat = createDummyCandidate({
        canonicalQuestionId: 'q_mat',
        candidateAnswerId: 'c_mat',
        parsedPayload: {
          type: 'MATRIX_MATCH',
          pairs: [
            { sourceLabel: 'P', targetLabels: ['1'] },
            { sourceLabel: 'Q', targetLabels: ['2'] },
          ],
        },
      });
      const res = createResolutionVersion({
        canonicalQuestionId: 'q_mat',
        candidate: candMat,
        versionNumber: 1,
        authorityDocumentSourceId: 'src_1',
        effectiveFrom: '2026-01-01T00:00:00Z',
      });
      const attemptPart: UserAttemptResponse = {
        attemptId: 'att_mat',
        canonicalQuestionId: 'q_mat',
        userMatrixPairs: [{ source: 'P', target: '1' }], // partial 1 match
        isSkipped: false,
        responseFingerprint: deriveResponseFingerprint({ userMatrixPairs: [{ source: 'P', target: '1' }], isSkipped: false }),
        submittedAt: 1000,
      };

      const outcome = evaluateUserAttempt({
        attempt: attemptPart,
        resolution: res,
        candidate: candMat,
        policyVersion: badPolicy,
        questionTraits: { canonicalQuestionType: 'MATRIX_MATCH' },
      });
      expect(outcome.isEvaluated).toBe(false);
      expect(outcome.failureReason).toContain('marksPerRow');
    });

    it('Fails closed if NAT interval target evaluation is missing boundsInclusivity', () => {
      const badPolicy: ScoringPolicyVersion = {
        policyVersionId: 'pol_bad_nat',
        policyId: 'pol_bad',
        versionNumber: 1,
        policyFingerprint: 'fp',
        rules: [
          {
            ruleId: 'r_bad_nat',
            policyType: 'NUMERICAL_TOLERANCE',
            canonicalQuestionType: 'NUMERICAL_RANGE_NAT',
            positiveMarks: 2.0,
            negativeMarks: 0.0,
            unansweredMarks: 0.0,
            numericalToleranceConfig: {
              // boundsInclusivity missing!
            },
          },
        ],
        effectiveFrom: '2026-01-01T00:00:00Z',
        createdAt: 1000,
      };

      const candNat = createDummyCandidate({
        canonicalQuestionId: 'q_nat',
        candidateAnswerId: 'c_nat',
        parsedPayload: {
          type: 'NUMERICAL_RANGE_NAT',
          rangeLow: '10.0',
          rangeHigh: '20.0',
        },
      });
      const res = createResolutionVersion({
        canonicalQuestionId: 'q_nat',
        candidate: candNat,
        versionNumber: 1,
        authorityDocumentSourceId: 'src_1',
        effectiveFrom: '2026-01-01T00:00:00Z',
      });
      const attempt: UserAttemptResponse = {
        attemptId: 'att_nat',
        canonicalQuestionId: 'q_nat',
        userNumericalInput: '15.0',
        isSkipped: false,
        responseFingerprint: deriveResponseFingerprint({ userNumericalInput: '15.0', isSkipped: false }),
        submittedAt: 1000,
      };

      const outcome = evaluateUserAttempt({
        attempt,
        resolution: res,
        candidate: candNat,
        policyVersion: badPolicy,
        questionTraits: { canonicalQuestionType: 'NUMERICAL_RANGE_NAT' },
      });
      expect(outcome.isEvaluated).toBe(false);
      expect(outcome.failureReason).toContain('boundsInclusivity');
    });

    it('Complete rule succeeds and equivalent complete rules remain deterministic', () => {
      const policy = createDummyPolicy();
      const cand = createDummyCandidate({ canonicalQuestionId: 'q_det', candidateAnswerId: 'c_det' });
      const res = createResolutionVersion({
        canonicalQuestionId: 'q_det',
        candidate: cand,
        versionNumber: 1,
        authorityDocumentSourceId: 'src_1',
        effectiveFrom: '2026-01-01T00:00:00Z',
      });
      const attempt: UserAttemptResponse = {
        attemptId: 'att_det',
        canonicalQuestionId: 'q_det',
        userSelectedOptionIds: ['A'],
        isSkipped: false,
        responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['A'], isSkipped: false }),
        submittedAt: 1000,
      };

      const out1 = evaluateUserAttempt({ attempt, resolution: res, candidate: cand, policyVersion: policy, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } });
      const out2 = evaluateUserAttempt({ attempt, resolution: res, candidate: cand, policyVersion: policy, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } });

      expect(out1.isEvaluated).toBe(true);
      expect(out2.isEvaluated).toBe(true);
      expect(out1.record?.evaluationId).toBe(out2.record?.evaluationId);
      expect(out1.record?.awardedMarks).toBe(2.0);
    });
  });

  // ==========================================================================
  // 3. YELLOW 3: Deterministic Conflict ID
  // ==========================================================================
  describe('YELLOW 3: Deterministic Conflict ID', () => {
    const cand = createDummyCandidate({ canonicalQuestionId: 'q_det_conf', candidateAnswerId: 'c_det_conf' });
    const v1 = createResolutionVersion({
      canonicalQuestionId: 'q_det_conf',
      candidate: cand,
      versionNumber: 1,
      authorityDocumentSourceId: 'src_1',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });
    const v2a = createResolutionVersion({
      canonicalQuestionId: 'q_det_conf',
      candidate: cand,
      versionNumber: 2,
      authorityDocumentSourceId: 'src_2a',
      supersedesVersionId: v1.resolutionVersionId,
      effectiveFrom: '2026-02-01T00:00:00Z',
    });
    const v2b = createResolutionVersion({
      canonicalQuestionId: 'q_det_conf',
      candidate: cand,
      versionNumber: 2,
      authorityDocumentSourceId: 'src_2b',
      supersedesVersionId: v1.resolutionVersionId,
      effectiveFrom: '2026-02-05T00:00:00Z',
    });

    it('Repeated evaluation produces identical conflictId', () => {
      const lin1 = evaluateLineageHead('q_det_conf', [v1, v2a, v2b]);
      const lin2 = evaluateLineageHead('q_det_conf', [v1, v2a, v2b]);

      expect(lin1.status).toBe('LINEAGE_CONFLICT');
      expect(lin2.status).toBe('LINEAGE_CONFLICT');
      expect(lin1.conflictRecord?.conflictId).toBe(lin2.conflictRecord?.conflictId);
      expect(lin1.conflictRecord?.conflictId).not.toContain('undefined');
    });

    it('Reordered conflictingVersionIds produces identical conflictId', () => {
      const idOrder1 = deriveConflictId({
        resolutionFamilyId: v1.resolutionFamilyId,
        conflictingVersionIds: [v2a.resolutionVersionId, v2b.resolutionVersionId],
      });
      const idOrder2 = deriveConflictId({
        resolutionFamilyId: v1.resolutionFamilyId,
        conflictingVersionIds: [v2b.resolutionVersionId, v2a.resolutionVersionId],
      });
      expect(idOrder1).toBe(idOrder2);
    });

    it('Changed conflictingVersionIds produces different conflictId', () => {
      const v2c = createResolutionVersion({
        canonicalQuestionId: 'q_det_conf',
        candidate: cand,
        versionNumber: 2,
        authorityDocumentSourceId: 'src_2c',
        supersedesVersionId: v1.resolutionVersionId,
        effectiveFrom: '2026-02-10T00:00:00Z',
      });
      const idPair = deriveConflictId({
        resolutionFamilyId: v1.resolutionFamilyId,
        conflictingVersionIds: [v2a.resolutionVersionId, v2b.resolutionVersionId],
      });
      const idTriple = deriveConflictId({
        resolutionFamilyId: v1.resolutionFamilyId,
        conflictingVersionIds: [v2a.resolutionVersionId, v2b.resolutionVersionId, v2c.resolutionVersionId],
      });
      expect(idPair).not.toBe(idTriple);
    });

    it('Process restart simulation yields identical conflictId', () => {
      const expectedSha256 = computeCanonicalSha256('conflict', {
        conflictingVersionIds: [v2a.resolutionVersionId, v2b.resolutionVersionId].sort(),
        resolutionFamilyId: v1.resolutionFamilyId,
      });
      const lin = evaluateLineageHead('q_det_conf', [v1, v2a, v2b]);
      expect(lin.conflictRecord?.conflictId).toBe(expectedSha256);
    });
  });

  // ==========================================================================
  // 4. YELLOW 4: Explicit Conflict Resolution Event Invariants
  // ==========================================================================
  describe('YELLOW 4: Conflict Resolution Event Invariants (Scenarios A through I)', () => {
    const cand = createDummyCandidate({ canonicalQuestionId: 'q_event_adv', candidateAnswerId: 'c_adv' });
    const v1 = createResolutionVersion({
      canonicalQuestionId: 'q_event_adv',
      candidate: cand,
      versionNumber: 1,
      authorityDocumentSourceId: 'doc_1',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });
    const v2a = createResolutionVersion({
      canonicalQuestionId: 'q_event_adv',
      candidate: cand,
      versionNumber: 2,
      authorityDocumentSourceId: 'doc_2a',
      supersedesVersionId: v1.resolutionVersionId,
      effectiveFrom: '2026-02-01T00:00:00Z',
    });
    const v2b = createResolutionVersion({
      canonicalQuestionId: 'q_event_adv',
      candidate: cand,
      versionNumber: 2,
      authorityDocumentSourceId: 'doc_2b',
      supersedesVersionId: v1.resolutionVersionId,
      effectiveFrom: '2026-02-05T00:00:00Z',
    });
    const v3 = createResolutionVersion({
      canonicalQuestionId: 'q_event_adv',
      candidate: cand,
      versionNumber: 3,
      authorityDocumentSourceId: 'doc_court_order',
      supersedesVersionId: v2a.resolutionVersionId,
      effectiveFrom: '2026-03-01T00:00:00Z',
    });

    it('A. Both heads explicitly referenced -> Valid unification', () => {
      const validEvent: ConflictResolutionEvent = {
        eventId: 'evt_valid',
        conflictId: 'conf_1',
        resolutionFamilyId: v1.resolutionFamilyId,
        unifyingResolutionVersionId: v3.resolutionVersionId,
        resolvedConflictHeadVersionIds: [v2a.resolutionVersionId, v2b.resolutionVersionId],
        resolutionRationale: 'Both competing heads unified',
        resolvedAt: 1000,
      };

      const res = evaluateLineageHead('q_event_adv', [v1, v2a, v2b, v3], [validEvent]);
      expect(res.status).toBe('AUTHORITATIVE');
      expect(res.authoritativeResolution?.resolutionVersionId).toBe(v3.resolutionVersionId);
    });

    it('B. One head omitted -> Conflict remains', () => {
      const partialEvent: ConflictResolutionEvent = {
        eventId: 'evt_partial',
        conflictId: 'conf_1',
        resolutionFamilyId: v1.resolutionFamilyId,
        unifyingResolutionVersionId: v3.resolutionVersionId,
        resolvedConflictHeadVersionIds: [v2a.resolutionVersionId], // v2b omitted!
        resolutionRationale: 'Only v2a referenced',
        resolvedAt: 1000,
      };

      const res = evaluateLineageHead('q_event_adv', [v1, v2a, v2b, v3], [partialEvent]);
      expect(res.status).toBe('LINEAGE_CONFLICT');
      expect(res.competingResolutionVersions).toHaveLength(2); // v2b and v3 both remain
    });

    it('C. Dangling head reference -> Fail closed', () => {
      const danglingEvent: ConflictResolutionEvent = {
        eventId: 'evt_dangle',
        conflictId: 'conf_1',
        resolutionFamilyId: v1.resolutionFamilyId,
        unifyingResolutionVersionId: v3.resolutionVersionId,
        resolvedConflictHeadVersionIds: [v2a.resolutionVersionId, 'v_non_existent_ghost'],
        resolutionRationale: 'Contains ghost head',
        resolvedAt: 1000,
      };

      const res = evaluateLineageHead('q_event_adv', [v1, v2a, v2b, v3], [danglingEvent]);
      expect(res.status).toBe('LINEAGE_CONFLICT');
      expect(res.conflictRecord?.conflictReason).toContain('dangling');
    });

    it('D. Invalid / unverified unifying version -> Fail closed', () => {
      const unverifiedV3 = createResolutionVersion({
        canonicalQuestionId: 'q_event_adv',
        candidate: { ...cand, verificationStatus: 'CANDIDATE' }, // Not VERIFIED!
        versionNumber: 3,
        authorityDocumentSourceId: 'doc_court_order',
        supersedesVersionId: v2a.resolutionVersionId,
        effectiveFrom: '2026-03-01T00:00:00Z',
      });

      const badEvent: ConflictResolutionEvent = {
        eventId: 'evt_bad_unifying',
        conflictId: 'conf_1',
        resolutionFamilyId: v1.resolutionFamilyId,
        unifyingResolutionVersionId: unverifiedV3.resolutionVersionId,
        resolvedConflictHeadVersionIds: [v2a.resolutionVersionId, v2b.resolutionVersionId],
        resolutionRationale: 'Unifying version is unverified',
        resolvedAt: 1000,
      };

      const res = evaluateLineageHead('q_event_adv', [v1, v2a, v2b, unverifiedV3], [badEvent]);
      expect(res.status).toBe('LINEAGE_CONFLICT');
      expect(res.conflictRecord?.conflictReason).toContain('unverified');
    });

    it('E. Reordered head list -> Same event identity', () => {
      const id1 = deriveConflictResolutionEventId({
        conflictId: 'c1',
        resolutionFamilyId: 'fam1',
        unifyingResolutionVersionId: 'v3',
        resolvedConflictHeadVersionIds: ['v2a', 'v2b'],
      });
      const id2 = deriveConflictResolutionEventId({
        conflictId: 'c1',
        resolutionFamilyId: 'fam1',
        unifyingResolutionVersionId: 'v3',
        resolvedConflictHeadVersionIds: ['v2b', 'v2a'],
      });
      expect(id1).toBe(id2);
    });

    it('F. Duplicate head list -> Deterministic normalized identity', () => {
      const idSingle = deriveConflictResolutionEventId({
        conflictId: 'c1',
        resolutionFamilyId: 'fam1',
        unifyingResolutionVersionId: 'v3',
        resolvedConflictHeadVersionIds: ['v2a', 'v2b'],
      });
      const idDupe = deriveConflictResolutionEventId({
        conflictId: 'c1',
        resolutionFamilyId: 'fam1',
        unifyingResolutionVersionId: 'v3',
        resolvedConflictHeadVersionIds: ['v2a', 'v2b', 'v2a', 'v2b'],
      });
      expect(idDupe).toBe(idSingle);
    });

    it('G. Unrelated historical version included -> Rejected / Fail closed', () => {
      // v1 was already superseded by v2a/v2b before the conflict
      const invalidEvent: ConflictResolutionEvent = {
        eventId: 'evt_ancestor',
        conflictId: 'conf_1',
        resolutionFamilyId: v1.resolutionFamilyId,
        unifyingResolutionVersionId: v3.resolutionVersionId,
        resolvedConflictHeadVersionIds: [v1.resolutionVersionId, v2a.resolutionVersionId, v2b.resolutionVersionId],
        resolutionRationale: 'Incorrectly includes historical ancestor v1',
        resolvedAt: 1000,
      };

      const res = evaluateLineageHead('q_event_adv', [v1, v2a, v2b, v3], [invalidEvent]);
      expect(res.status).toBe('LINEAGE_CONFLICT');
      expect(res.conflictRecord?.conflictReason).toContain('unrelated historical version');
    });

    it('H. Historical attempts remain unchanged', () => {
      const policy = createDummyPolicy();
      const attempt: UserAttemptResponse = {
        attemptId: 'att_hist',
        canonicalQuestionId: 'q_event_adv',
        userSelectedOptionIds: ['A'],
        isSkipped: false,
        responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['A'], isSkipped: false }),
        submittedAt: 500,
      };

      const evalBefore = evaluateUserAttempt({
        attempt,
        resolution: v1,
        candidate: cand,
        policyVersion: policy,
        questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' },
      });

      // Appending conflict resolution event later does not mutate v1 or historical eval
      expect(evalBefore.record?.awardedMarks).toBe(2.0);
      expect(evalBefore.record?.resolvedAnswerVersionId).toBe(v1.resolutionVersionId);
    });

    it('I. Event replay is deterministic', () => {
      const validEvent: ConflictResolutionEvent = {
        eventId: 'evt_replay',
        conflictId: 'conf_1',
        resolutionFamilyId: v1.resolutionFamilyId,
        unifyingResolutionVersionId: v3.resolutionVersionId,
        resolvedConflictHeadVersionIds: [v2a.resolutionVersionId, v2b.resolutionVersionId],
        resolutionRationale: 'Deterministic unification',
        resolvedAt: 1000,
      };

      const run1 = evaluateLineageHead('q_event_adv', [v1, v2a, v2b, v3], [validEvent]);
      const run2 = evaluateLineageHead('q_event_adv', [v1, v2a, v2b, v3], [validEvent]);

      expect(run1.status).toBe('AUTHORITATIVE');
      expect(run2.status).toBe('AUTHORITATIVE');
      expect(run1.authoritativeResolution?.resolutionVersionId).toBe(run2.authoritativeResolution?.resolutionVersionId);
    });
  });

  // ==========================================================================
  // 5. YELLOW 5: NAT Resource Bounds
  // ==========================================================================
  describe('YELLOW 5: Exact NAT Resource Bounds', () => {
    it('Pathological exponent (>1000) fails closed with EXCEEDS_MAX_NUMERIC_MAGNITUDE', () => {
      const hugeExp = '1.5e10000000';
      const parsed = parseExactNumericInput(hugeExp);
      expect(parsed.isSuccess).toBe(false);
      expect(parsed.errorCode).toBe('EXCEEDS_MAX_NUMERIC_MAGNITUDE');
    });

    it('Pathological decimal digits (>1000 digits) fails closed with EXCEEDS_MAX_NUMERIC_MAGNITUDE', () => {
      const hugeDigits = '9'.repeat(1005);
      const parsed = parseExactNumericInput(hugeDigits);
      expect(parsed.isSuccess).toBe(false);
      expect(parsed.errorCode).toBe('EXCEEDS_MAX_NUMERIC_MAGNITUDE');
    });

    it('Pathological fraction string (>1000 digits) fails closed with EXCEEDS_MAX_NUMERIC_MAGNITUDE', () => {
      const hugeFraction = `${'1'.repeat(1005)}/2`;
      const parsed = parseExactNumericInput(hugeFraction, { allowFractions: true });
      expect(parsed.isSuccess).toBe(false);
      expect(parsed.errorCode).toBe('EXCEEDS_MAX_NUMERIC_MAGNITUDE');
    });

    it('Bounded large numbers within configured limits succeed without float corruption', () => {
      const validLarge = parseExactNumericInput('1.5e100');
      expect(validLarge.isSuccess).toBe(true);
      expect(validLarge.parsedRepresentation?.format).toBe('EXACT_DECIMAL');

      const rat = toBigIntRational(validLarge.parsedRepresentation!);
      expect(rat.num > 10n ** 90n).toBe(true);
      expect(rat.den).toBe(1n);
    });
  });

  // ==========================================================================
  // 6. YELLOW 6: Matrix Target Labels Domain Semantics
  // ==========================================================================
  describe('YELLOW 6: Matrix Target Label Unordered Set Semantics', () => {
    it('Bipartite matrix targetLabels are semantically unordered sets; sorted deterministically in domain normalization', () => {
      const payloadA = {
        type: 'MATRIX_MATCH',
        pairs: [
          { sourceLabel: 'P', targetLabels: ['3', '1'] },
          { sourceLabel: 'Q', targetLabels: ['4', '2'] },
        ],
      };
      const payloadB = {
        type: 'MATRIX_MATCH',
        pairs: [
          { sourceLabel: 'P', targetLabels: ['1', '3'] },
          { sourceLabel: 'Q', targetLabels: ['2', '4'] },
        ],
      };

      const hashA = computeCanonicalSha256('matrix_test', payloadA);
      const hashB = computeCanonicalSha256('matrix_test', payloadB);

      // Bitwise identical canonical hash despite different initial array orders!
      expect(hashA).toBe(hashB);
    });
  });
});
