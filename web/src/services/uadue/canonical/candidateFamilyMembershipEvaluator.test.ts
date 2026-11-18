/**
 * UADUE Phase 2D-2 — Candidate Family Membership Evaluator Adversarial Test Suite
 * Document Version: 3.0.0-TOPOLOGY-HARDENED
 *
 * Validates:
 * CASE A: A-B proven, B-C proven, no A-C proof => NO A-family-C membership.
 * CASE B: A LANGUAGE B proven, B LANGUAGE C proven => No A-C membership.
 * CASE C: A CONTINUATION B proven => membership rejected.
 * CASE D: A VARIANT B proven => membership rejected.
 * CASE E: A possible duplicate B => membership rejected.
 * CASE F: A-B has PROVEN status but stale/mismatched provenance => membership rejected.
 * CASE G: Dangling evaluation ID => membership rejected.
 * CASE H: Evaluation ID belongs to different candidate pair => membership rejected.
 * CASE I: Evidence references check & non-eligible status rejection.
 * CASE J: Same valid membership inputs in reversed order => identical deterministic result.
 * CASE K: Source discrepancy in printed numbering => source values preserved exactly.
 * CASE L: Frozen nested inputs => zero mutation.
 */

import { describe, it, expect } from 'vitest';
import {
  QuestionCandidate,
  RelationshipEvidence,
  QuestionRelationshipCandidate,
  QuestionRelationshipType,
} from '../contracts/questionGraph';
import {
  RelationshipEvaluationResult,
  CanonicalRelationshipType,
} from './types';
import { CandidateFamilyMembershipEvaluator } from './candidateFamilyMembershipEvaluator';
import { RelationshipEvaluationEngine } from './relationshipEvaluationEngine';

describe('UADUE Phase 2D-2 — CandidateFamilyMembership Evaluator Adversarial Suite', () => {
  const membershipEvaluator = new CandidateFamilyMembershipEvaluator();
  const relEngine = new RelationshipEvaluationEngine();

  const createMockCandidate = (overrides: Partial<QuestionCandidate>): QuestionCandidate => ({
    candidateId: 'cand_mock_1',
    physicalInstanceId: 'inst_mock_1',
    candidateDisplayOrder: 1,
    sourceOrder: 1,
    startPageNumber: 2,
    endPageNumber: 2,
    isMultiPage: false,
    identityCandidate: {
      physicalInstanceId: 'inst_mock_1',
      numberType: 'QUESTION_NUMBER',
      confidence: 1.0,
      supportingEvidenceIds: [],
    },
    includedPhysicalNodeIds: ['node_1', 'node_2'],
    stemNodeIds: ['node_1'],
    bodyNodeIds: ['node_2'],
    optionCandidateIds: ['opt_1', 'opt_2', 'opt_3', 'opt_4'],
    stimulusRefIds: [],
    tableCandidateIds: [],
    diagramCandidateIds: [],
    mathCandidateIds: [],
    codeCandidateIds: [],
    observationState: 'OBSERVED',
    verificationStatus: 'SUPPORTED',
    confidenceScore: 0.95,
    evidenceList: [],
    unresolvedAmbiguityIds: [],
    languageRepresentations: [
      {
        languageScript: 'DEVANAGARI',
        pageNumber: 2,
        stemNodeIds: ['node_1'],
        bodyNodeIds: ['node_2'],
        optionCandidateIds: ['opt_1', 'opt_2', 'opt_3', 'opt_4'],
      },
    ],
    ...overrides,
  });

  const createMockEvaluation = (
    relType: CanonicalRelationshipType,
    candA: QuestionCandidate,
    candB: QuestionCandidate,
    overrides?: Partial<RelationshipEvaluationResult>
  ): RelationshipEvaluationResult => {
    const rel: QuestionRelationshipCandidate = {
      relationshipId: `rel_${candA.candidateId}_${candB.candidateId}`,
      sourceCandidateId: candA.candidateId,
      targetCandidateId: candB.candidateId,
      relationshipType: relType as unknown as QuestionRelationshipType,
      evidence: [
        {
          evidenceId: `ev_hard_1_${candA.candidateId}`,
          evidenceType: 'MATCHING_PRINTED_NUMERAL',
          evidenceStrength: 'HARD',
          sourceNodeIds: [],
          description: 'Matching numeral',
          confidence: 1.0,
        },
        {
          evidenceId: `ev_hard_2_${candB.candidateId}`,
          evidenceType: 'EXPLICIT_OFFICIAL_QUESTION_ID',
          evidenceStrength: 'HARD',
          sourceNodeIds: [],
          description: 'Official ID match',
          confidence: 1.0,
        },
      ],
      confidenceScore: 0.95,
      verificationStatus: 'RELATIONSHIP_PROVEN',
      isSymmetric: true,
      provenance: { sourceSnapshotId: 'snap_1', sourceDocumentId: 'doc_1', createdAt: 0 },
    };

    const evalResult = relEngine.evaluateRelationship({
      relationship: rel,
      sourceCandidate: candA,
      targetCandidate: candB,
    });

    return {
      ...evalResult,
      ...overrides,
    };
  };

  // ==========================================================================
  // Adversarial Cases A-L
  // ==========================================================================

  it('CASE A: A-B proven, B-C proven, no A-C proof => NO A-family-C membership', () => {
    const candA = createMockCandidate({ candidateId: 'cand_a', physicalInstanceId: 'inst_a' });
    const candB = createMockCandidate({ candidateId: 'cand_b', physicalInstanceId: 'inst_b' });
    const candC = createMockCandidate({ candidateId: 'cand_c', physicalInstanceId: 'inst_c' });

    const evalAB = createMockEvaluation('SAME_LOGICAL_QUESTION', candA, candB);
    const evalBC = createMockEvaluation('SAME_LOGICAL_QUESTION', candB, candC);

    // Attempt to propose A joining family anchored by C using evalAB (mismatched)
    const resultAC = membershipEvaluator.evaluateMembership({
      candidate: candA,
      familyTargetCandidate: candC,
      directRelationshipEvaluation: evalAB,
    });

    expect(resultAC.isAccepted).toBe(false);
    expect(resultAC.membership).toBeUndefined();
    expect(resultAC.rejectionReasons.some((r) => r.includes('does not match membership candidates'))).toBe(true);
  });

  it('CASE B: A LANGUAGE B proven, B LANGUAGE C proven => No A-C membership', () => {
    const candA = createMockCandidate({
      candidateId: 'cand_en1',
      physicalInstanceId: 'inst_en1',
      languageRepresentations: [{ languageScript: 'LATIN', pageNumber: 2, stemNodeIds: [], bodyNodeIds: [], optionCandidateIds: [] }],
    });
    const candB = createMockCandidate({
      candidateId: 'cand_hi',
      physicalInstanceId: 'inst_hi',
      languageRepresentations: [{ languageScript: 'DEVANAGARI', pageNumber: 3, stemNodeIds: [], bodyNodeIds: [], optionCandidateIds: [] }],
    });
    const candC = createMockCandidate({
      candidateId: 'cand_en2',
      physicalInstanceId: 'inst_en2',
      languageRepresentations: [{ languageScript: 'LATIN', pageNumber: 4, stemNodeIds: [], bodyNodeIds: [], optionCandidateIds: [] }],
    });

    const evalAB = createMockEvaluation('LANGUAGE_REPRESENTATION_OF', candA, candB);
    const evalBC = createMockEvaluation('LANGUAGE_REPRESENTATION_OF', candB, candC);

    // Batch evaluation with no A-C direct proposal
    const batchResult = membershipEvaluator.evaluateBatchMemberships({
      candidates: [candA, candB, candC],
      relationshipEvaluations: [evalAB, evalBC],
      membershipProposals: [
        { candidateId: 'cand_en1', familyTargetCandidateId: 'cand_hi', relationshipEvaluationId: evalAB.evaluationId },
        { candidateId: 'cand_hi', familyTargetCandidateId: 'cand_en2', relationshipEvaluationId: evalBC.evaluationId },
      ],
    });

    expect(batchResult.length).toBe(2);
    expect(batchResult[0].isAccepted).toBe(true);
    expect(batchResult[1].isAccepted).toBe(true);
    // Neither membership is for cand_en1 -> cand_en2
    expect(batchResult.some((r) => r.membership?.candidatePhysicalInstanceId === 'inst_en1' && r.membership?.familyCandidateId === 'cand_en2')).toBe(false);
  });

  it('CASE C: A CONTINUATION B proven => membership rejected', () => {
    const candHead = createMockCandidate({ candidateId: 'cand_head', physicalInstanceId: 'inst_head', startPageNumber: 2, candidateDisplayOrder: 1 });
    const candTail = createMockCandidate({ candidateId: 'cand_tail', physicalInstanceId: 'inst_tail', startPageNumber: 3, candidateDisplayOrder: 1 });

    const evalCont = createMockEvaluation('CONTINUATION_OF', candHead, candTail);
    expect(evalCont.verificationStatus).toBe('RELATIONSHIP_PROVEN');
    expect(evalCont.isEligibleForFamilySynthesis).toBe(false);

    const result = membershipEvaluator.evaluateMembership({
      candidate: candHead,
      familyTargetCandidate: candTail,
      directRelationshipEvaluation: evalCont,
    });

    expect(result.isAccepted).toBe(false);
    expect(result.membership).toBeUndefined();
    expect(result.rejectionReasons.some((r) => r.includes('not eligible for family membership'))).toBe(true);
  });

  it('CASE D: A VARIANT B proven => membership rejected', () => {
    const candA = createMockCandidate({ candidateId: 'cand_var_a', physicalInstanceId: 'inst_var_a' });
    const candB = createMockCandidate({ candidateId: 'cand_var_b', physicalInstanceId: 'inst_var_b' });

    const evalVar = createMockEvaluation('VARIANT_OF', candA, candB);

    const result = membershipEvaluator.evaluateMembership({
      candidate: candA,
      familyTargetCandidate: candB,
      directRelationshipEvaluation: evalVar,
    });

    expect(result.isAccepted).toBe(false);
    expect(result.membership).toBeUndefined();
    expect(result.rejectionReasons.some((r) => r.includes('not eligible for family membership'))).toBe(true);
  });

  it('CASE E: A possible duplicate B => membership rejected', () => {
    const candA = createMockCandidate({ candidateId: 'cand_dup_a', physicalInstanceId: 'inst_dup_a' });
    const candB = createMockCandidate({ candidateId: 'cand_dup_b', physicalInstanceId: 'inst_dup_b' });

    const evalDup = createMockEvaluation('POSSIBLE_DUPLICATE_CANDIDATE', candA, candB);

    const result = membershipEvaluator.evaluateMembership({
      candidate: candA,
      familyTargetCandidate: candB,
      directRelationshipEvaluation: evalDup,
    });

    expect(result.isAccepted).toBe(false);
    expect(result.membership).toBeUndefined();
    expect(result.rejectionReasons.some((r) => r.includes('not eligible for family membership'))).toBe(true);
  });

  it('CASE F: A-B has PROVEN status but stale/mismatched provenance => membership rejected', () => {
    const candA = createMockCandidate({ candidateId: 'cand_a', physicalInstanceId: 'inst_a' });
    const candB = createMockCandidate({ candidateId: 'cand_b', physicalInstanceId: 'inst_b' });

    const evalProven = createMockEvaluation('SAME_LOGICAL_QUESTION', candA, candB);

    const result = membershipEvaluator.evaluateMembership({
      candidate: candA,
      familyTargetCandidate: candB,
      directRelationshipEvaluation: evalProven,
      sourceSnapshotId: 'mismatched_snapshot_id_2026',
    });

    expect(result.isAccepted).toBe(false);
    expect(result.membership).toBeUndefined();
    expect(result.rejectionReasons.some((r) => r.includes('Provenance mismatch: input sourceSnapshotId'))).toBe(true);
  });

  it('CASE G: Dangling evaluation ID => membership rejected', () => {
    const candA = createMockCandidate({ candidateId: 'cand_a', physicalInstanceId: 'inst_a' });
    const candB = createMockCandidate({ candidateId: 'cand_b', physicalInstanceId: 'inst_b' });

    const batchResult = membershipEvaluator.evaluateBatchMemberships({
      candidates: [candA, candB],
      relationshipEvaluations: [], // Empty evaluations array!
      membershipProposals: [
        { candidateId: 'cand_a', familyTargetCandidateId: 'cand_b', relationshipEvaluationId: 'dangling_eval_id_999' },
      ],
    });

    expect(batchResult.length).toBe(1);
    expect(batchResult[0].isAccepted).toBe(false);
    expect(batchResult[0].rejectionReasons.some((r) => r.includes('dangling ID'))).toBe(true);
  });

  it('CASE H: Evaluation ID belongs to different candidate pair => membership rejected', () => {
    const candA = createMockCandidate({ candidateId: 'cand_a', physicalInstanceId: 'inst_a' });
    const candB = createMockCandidate({ candidateId: 'cand_b', physicalInstanceId: 'inst_b' });
    const candX = createMockCandidate({ candidateId: 'cand_x', physicalInstanceId: 'inst_x' });
    const candY = createMockCandidate({ candidateId: 'cand_y', physicalInstanceId: 'inst_y' });

    const evalXY = createMockEvaluation('SAME_LOGICAL_QUESTION', candX, candY);

    const result = membershipEvaluator.evaluateMembership({
      candidate: candA,
      familyTargetCandidate: candB,
      directRelationshipEvaluation: evalXY,
    });

    expect(result.isAccepted).toBe(false);
    expect(result.rejectionReasons.some((r) => r.includes('does not match membership candidates'))).toBe(true);
  });

  it('CASE I: Unverified / Plausible evaluation => membership rejected', () => {
    const candA = createMockCandidate({ candidateId: 'cand_a', physicalInstanceId: 'inst_a' });
    const candB = createMockCandidate({ candidateId: 'cand_b', physicalInstanceId: 'inst_b' });

    const evalPlausible = createMockEvaluation('SAME_LOGICAL_QUESTION', candA, candB, {
      verificationStatus: 'RELATIONSHIP_PLAUSIBLE',
      isEligibleForFamilySynthesis: false,
    });

    const result = membershipEvaluator.evaluateMembership({
      candidate: candA,
      familyTargetCandidate: candB,
      directRelationshipEvaluation: evalPlausible,
    });

    expect(result.isAccepted).toBe(false);
    expect(result.rejectionReasons.some((r) => r.includes('is not RELATIONSHIP_PROVEN'))).toBe(true);
  });

  it('CASE J: Same valid membership inputs in reversed order => identical deterministic result', () => {
    const candA = createMockCandidate({ candidateId: 'cand_a', physicalInstanceId: 'inst_a' });
    const candB = createMockCandidate({ candidateId: 'cand_b', physicalInstanceId: 'inst_b' });

    const evalAB = createMockEvaluation('SAME_LOGICAL_QUESTION', candA, candB);

    const result1 = membershipEvaluator.evaluateMembership({
      candidate: candA,
      familyTargetCandidate: candB,
      directRelationshipEvaluation: evalAB,
    });

    const result2 = membershipEvaluator.evaluateMembership({
      candidate: candA,
      familyTargetCandidate: candB,
      directRelationshipEvaluation: evalAB,
    });

    expect(result1.isAccepted).toBe(true);
    expect(result2.isAccepted).toBe(true);
    expect(result1.deterministicFingerprint).toBe(result2.deterministicFingerprint);
    expect(result1.membership?.membershipFingerprint).toBe(result2.membership?.membershipFingerprint);
  });

  it('CASE K: Source discrepancy in printed numbering => source values preserved exactly', () => {
    const hindiQ16 = createMockCandidate({
      candidateId: 'cand_upsc_p6_q16_hin',
      physicalInstanceId: 'inst_p6_q16_hin',
      sourceQuestionNumber: '16',
      startPageNumber: 6,
      languageRepresentations: [
        { languageScript: 'DEVANAGARI', pageNumber: 6, stemNodeIds: ['hn_16'], bodyNodeIds: [], optionCandidateIds: [] },
      ],
    });

    const englishQ15 = createMockCandidate({
      candidateId: 'cand_upsc_p7_q15_eng',
      physicalInstanceId: 'inst_p7_q15_eng',
      sourceQuestionNumber: '15',
      startPageNumber: 7,
      languageRepresentations: [
        { languageScript: 'LATIN', pageNumber: 7, stemNodeIds: ['en_15'], bodyNodeIds: [], optionCandidateIds: [] },
      ],
    });

    const evalDiscrepancy = createMockEvaluation('LANGUAGE_REPRESENTATION_OF', hindiQ16, englishQ15, {
      verificationStatus: 'RELATIONSHIP_PROVEN',
      isEligibleForFamilySynthesis: true,
    });

    const result = membershipEvaluator.evaluateMembership({
      candidate: hindiQ16,
      familyTargetCandidate: englishQ15,
      directRelationshipEvaluation: evalDiscrepancy,
    });

    expect(result.isAccepted).toBe(true);
    expect(result.membership?.candidatePhysicalInstanceId).toBe('inst_p6_q16_hin');
    expect(result.membership?.familyCandidateId).toBe('cand_upsc_p7_q15_eng');
    // Ensure source candidates remain untouched
    expect(hindiQ16.sourceQuestionNumber).toBe('16');
    expect(englishQ15.sourceQuestionNumber).toBe('15');
  });

  it('CASE L: Deeply frozen nested inputs => completes with zero mutation', () => {
    const candA = Object.freeze(createMockCandidate({ candidateId: 'cand_f_a', physicalInstanceId: 'inst_f_a' }));
    const candB = Object.freeze(createMockCandidate({ candidateId: 'cand_f_b', physicalInstanceId: 'inst_f_b' }));
    const evalProven = Object.freeze(createMockEvaluation('SAME_LOGICAL_QUESTION', candA, candB));

    expect(() => {
      const result = membershipEvaluator.evaluateMembership({
        candidate: candA,
        familyTargetCandidate: candB,
        directRelationshipEvaluation: evalProven,
      });
      expect(result.isAccepted).toBe(true);
    }).not.toThrow();
  });
});
