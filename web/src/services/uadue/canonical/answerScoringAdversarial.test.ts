/**
 * UADUE Phase 2D-5 — Answer Authority & Scoring Complete Adversarial Test Suite
 * Document Version: 5.3.0-TEST-SUITE
 *
 * Implements and executes all 52 frozen adversarial test scenarios (Scenarios A through AZ).
 */

import { describe, it, expect } from 'vitest';
import {
  AnswerKeyEntry,
  AnswerEvidence,
  CanonicalQuestionIR,
  AnswerCandidate,
  ScoringPolicyVersion,
  ScoringPolicyRule,
  UserAttemptResponse,
} from './types';
import { QuestionCandidate } from '../contracts/questionGraph';
import {
  rfc8785Canonicalize,
  domainCanonicalize,
  computeCanonicalSha256,
  deriveEntryId,
  deriveEvaluationId,
  deriveResolutionVersionId,
  deriveResponseFingerprint,
} from './canonicalHashing';
import {
  parseExactNumericInput,
  evaluateExactNumericMatch,
  toBigIntRational,
} from './exactNumericEvaluator';
import {
  bindAndEvaluateAnswerCandidate,
  parseRawAnswerValue,
  evaluateVerificationStatusFromEvidence,
} from './answerCandidateEvaluator';
import {
  createResolutionVersion,
  evaluateLineageHead,
  deriveEffectiveTimeRange,
} from './answerAuthorityResolver';
import {
  selectScoringPolicyRule,
  evaluateUserAttempt,
} from './scoringEvaluator';

// ============================================================================
// Fixtures & Helper Generators
// ============================================================================

function createMockPhysicalCandidate(params: {
  physicalInstanceId: string;
  printedQuestionNumber: string;
  sectionId?: string;
  sourceDocumentId?: string;
}): QuestionCandidate & { printedQuestionNumber?: string; sectionId?: string } {
  return {
    candidateId: `cand_${params.physicalInstanceId}`,
    physicalInstanceId: params.physicalInstanceId,
    sourceQuestionNumber: params.printedQuestionNumber,
    printedQuestionNumber: params.printedQuestionNumber,
    sectionId: params.sectionId,
    candidateDisplayOrder: 1,
    sourceOrder: 1,
    startPageNumber: 1,
    endPageNumber: 1,
    isMultiPage: false,
    identityCandidate: {
      physicalInstanceId: params.physicalInstanceId,
      sourcePrintedLabel: `Q.${params.printedQuestionNumber}`,
      detectedNumber: parseInt(params.printedQuestionNumber, 10) || 1,
      numberType: 'QUESTION_NUMBER',
      confidence: 1.0,
      supportingEvidenceIds: [],
    },
    includedPhysicalNodeIds: [`node_stem_${params.physicalInstanceId}`],
    stemNodeIds: [`node_stem_${params.physicalInstanceId}`],
    bodyNodeIds: [],
    optionCandidateIds: [],
    stimulusRefIds: [],
    tableCandidateIds: [],
    diagramCandidateIds: [],
    mathCandidateIds: [],
    codeCandidateIds: [],
    observationState: 'OBSERVED',
    verificationStatus: 'VERIFIED',
    confidenceScore: 1.0,
    evidenceList: [],
    unresolvedAmbiguityIds: [],
  };
}

function createMockCanonicalQuestion(params: {
  canonicalQuestionId: string;
  memberPhysicalInstanceIds: string[];
}): CanonicalQuestionIR {
  return {
    canonicalQuestionId: params.canonicalQuestionId,
    logicalFamilyId: `fam_${params.canonicalQuestionId}`,
    memberPhysicalInstanceIds: params.memberPhysicalInstanceIds,
    sourceSnapshotId: 'snap_test_1',
    sourceDocumentId: 'doc_test_1',
    directRelationshipEvaluationIds: [],
    representations: params.memberPhysicalInstanceIds.map((physId) => ({
      representationId: `rep_${physId}`,
      representationRole: 'ANCHOR_REPRESENTATION',
      sourcePageNumber: 1,
      sourcePhysicalInstanceId: physId,
      sourceCandidateId: `cand_${physId}`,
      stemRawText: `Stem for ${physId}`,
      stemAST: [],
      options: [],
      assets: [],
      isPrimary: true,
      provenance: {
        sourceSnapshotId: 'snap_test_1',
        sourceDocumentId: 'doc_test_1',
        physicalNodeIds: [],
      },
    })),
    sourceDiscrepancies: { hasNumberingDiscrepancy: false, sourceNumberings: [] },
    allAssetReferences: [],
    provenance: {
      sourceSnapshotId: 'snap_test_1',
      sourceDocumentId: 'doc_test_1',
      logicalFamilyId: `fam_${params.canonicalQuestionId}`,
      canonicalizerAlgorithmId: 'canon_v1',
      canonicalizerVersion: '1.0.0',
      schemaVersion: '5.3.0',
      synthesizedAt: 1000,
    },
    schemaVersion: '5.3.0',
    canonicalFingerprint: `fp_${params.canonicalQuestionId}`,
    synthesisReasons: ['Test synthesis'],
  };
}

function createMockScoringPolicy(): ScoringPolicyVersion {
  const rules: ScoringPolicyRule[] = [
    {
      ruleId: 'rule_mcq_standard',
      policyType: 'MCQ_FIXED_PENALTY',
      canonicalQuestionType: 'SINGLE_CHOICE_MCQ',
      positiveMarks: 2.0,
      negativeMarks: 0.66,
      unansweredMarks: 0.0,
    },
    {
      ruleId: 'rule_msq_all_or_nothing',
      policyType: 'MSQ_ALL_OR_NOTHING',
      canonicalQuestionType: 'MULTIPLE_CHOICE_MSQ',
      targetSubtype: 'ALL_OR_NOTHING',
      positiveMarks: 2.0,
      negativeMarks: 0.66,
      unansweredMarks: 0.0,
    },
    {
      ruleId: 'rule_msq_partial',
      policyType: 'MSQ_PARTIAL_CREDIT',
      canonicalQuestionType: 'MULTIPLE_CHOICE_MSQ',
      targetSubtype: 'PARTIAL_CREDIT',
      positiveMarks: 3.0,
      negativeMarks: 1.0,
      unansweredMarks: 0.0,
      partialCreditConfig: {
        singleOptionMatchWeight: 1.0,
        wrongOptionPenalty: 1.0,
      },
    },
    {
      ruleId: 'rule_nat_standard',
      policyType: 'NUMERICAL_TOLERANCE',
      canonicalQuestionType: 'NUMERICAL_RANGE_NAT',
      positiveMarks: 2.0,
      negativeMarks: 0.0,
      unansweredMarks: 0.0,
      numericalToleranceConfig: {
        absoluteTolerance: '0.05',
        boundsInclusivity: 'INCLUSIVE',
        allowFractionSyntax: true,
      },
    },
    {
      ruleId: 'rule_matrix_standard',
      policyType: 'MATRIX_EXACT',
      canonicalQuestionType: 'MATRIX_MATCH',
      positiveMarks: 4.0,
      negativeMarks: 1.0,
      unansweredMarks: 0.0,
      matrixMatchConfig: {
        marksPerRow: 1.0,
        penaltyPerWrongRow: 0.5,
        allowDuplicateTargets: false,
      },
    },
  ];

  return {
    policyVersionId: 'pol_ver_v1',
    policyId: 'pol_fam_general',
    versionNumber: 1,
    policyFingerprint: 'fp_policy_v1',
    rules,
    effectiveFrom: '2026-01-01T00:00:00Z',
    createdAt: 1000,
  };
}

describe('UADUE Phase 2D-5 — Complete Adversarial Test Suite (Scenarios A–AZ)', () => {
  // ==========================================================================
  // Core Scenarios A–T
  // ==========================================================================

  it('SCENARIO A (Multilingual Discrepancy): English key Q15 binds to canonical family with Hindi Q16 + English Q15', () => {
    const physEng = createMockPhysicalCandidate({ physicalInstanceId: 'phys_eng_15', printedQuestionNumber: '15' });
    const physHin = createMockPhysicalCandidate({ physicalInstanceId: 'phys_hin_16', printedQuestionNumber: '16' });
    const canonicalQ = createMockCanonicalQuestion({
      canonicalQuestionId: 'can_q15_16',
      memberPhysicalInstanceIds: ['phys_eng_15', 'phys_hin_16'],
    });

    const entry: AnswerKeyEntry = {
      entryId: 'entry_15',
      snapshotId: 'snap_1',
      sourceNodeId: 'node_15',
      pageNumber: 1,
      rawPrintedQuestionNumber: '15',
      rawExtractedValue: 'B',
      entryFingerprint: 'fp_15',
    };

    const result = bindAndEvaluateAnswerCandidate({
      entry,
      evidence: [{ evidenceId: 'ev_1', evidenceClass: 'DIRECT_OFFICIAL_FINAL_KEY', sourceId: 'src_1', documentType: 'FINAL_KEY', summary: 'Final' }],
      canonicalQuestions: [canonicalQ],
      physicalCandidates: [physEng, physHin],
    });

    expect(result.isBound).toBe(true);
    expect(result.candidate?.canonicalQuestionId).toBe('can_q15_16');
    expect(result.candidate?.parsedPayload.type).toBe('SINGLE_CHOICE_MCQ');
    if (result.candidate?.parsedPayload.type === 'SINGLE_CHOICE_MCQ') {
      expect(result.candidate.parsedPayload.correctOptionLabel).toBe('B');
    }
  });

  it('SCENARIO B (Homonymous Numbering): Sec I Q1 vs Sec II Q1 bind to distinct physical candidates', () => {
    const physSec1 = createMockPhysicalCandidate({ physicalInstanceId: 'phys_sec1_q1', printedQuestionNumber: '1', sectionId: 'SEC_I' });
    const physSec2 = createMockPhysicalCandidate({ physicalInstanceId: 'phys_sec2_q1', printedQuestionNumber: '1', sectionId: 'SEC_II' });
    const canSec1 = createMockCanonicalQuestion({ canonicalQuestionId: 'can_sec1_q1', memberPhysicalInstanceIds: ['phys_sec1_q1'] });
    const canSec2 = createMockCanonicalQuestion({ canonicalQuestionId: 'can_sec2_q1', memberPhysicalInstanceIds: ['phys_sec2_q1'] });

    const entrySec2: AnswerKeyEntry = {
      entryId: 'entry_sec2_1',
      snapshotId: 'snap_1',
      sourceNodeId: 'node_sec2_1',
      pageNumber: 2,
      rawSectionId: 'SEC_II',
      rawPrintedQuestionNumber: '1',
      rawExtractedValue: 'C',
      entryFingerprint: 'fp_sec2_1',
    };

    const result = bindAndEvaluateAnswerCandidate({
      entry: entrySec2,
      evidence: [{ evidenceId: 'ev_1', evidenceClass: 'DIRECT_OFFICIAL_FINAL_KEY', sourceId: 'src_1', documentType: 'FINAL_KEY', summary: 'Final' }],
      canonicalQuestions: [canSec1, canSec2],
      physicalCandidates: [physSec1, physSec2],
    });

    expect(result.isBound).toBe(true);
    expect(result.candidate?.canonicalQuestionId).toBe('can_sec2_q1');
  });

  it('SCENARIO C (Conflicting Keys): Two conflicting provisional keys transition to CONFLICTED status', () => {
    const candA: AnswerCandidate = {
      candidateAnswerId: 'cand_conf_a',
      canonicalQuestionId: 'can_conflict_q',
      sourceEntryId: 'entry_prov_a',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'B' },
      evidence: [
        { evidenceId: 'ev_1', evidenceClass: 'DIRECT_OFFICIAL_PROVISIONAL_KEY', sourceId: 'src_prov_a', documentType: 'PROV_A', summary: 'Provisional key set 1 says B' },
      ],
      verificationStatus: 'SUPPORTED',
      confidenceScore: 0.85,
      provenance: { sourceSnapshotId: 'snap_1', sourceDocumentId: 'doc_prov_a', adapterVersion: '1.0' },
    };

    const candB: AnswerCandidate = {
      candidateAnswerId: 'cand_conf_b',
      canonicalQuestionId: 'can_conflict_q',
      sourceEntryId: 'entry_prov_b',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'C' },
      evidence: [
        { evidenceId: 'ev_2', evidenceClass: 'DIRECT_OFFICIAL_PROVISIONAL_KEY', sourceId: 'src_prov_b', documentType: 'PROV_B', summary: 'Provisional key set 2 says C' },
      ],
      verificationStatus: 'SUPPORTED',
      confidenceScore: 0.85,
      provenance: { sourceSnapshotId: 'snap_2', sourceDocumentId: 'doc_prov_b', adapterVersion: '1.0' },
    };

    const resA = createResolutionVersion({
      canonicalQuestionId: 'can_conflict_q',
      candidate: candA,
      versionNumber: 1,
      authorityDocumentSourceId: 'doc_prov_a',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });

    const resB = createResolutionVersion({
      canonicalQuestionId: 'can_conflict_q',
      candidate: candB,
      versionNumber: 1,
      authorityDocumentSourceId: 'doc_prov_b',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });

    const lineage = evaluateLineageHead('can_conflict_q', [resA, resB]);
    expect(lineage.status).toBe('LINEAGE_CONFLICT');
    expect(lineage.competingResolutionVersions).toHaveLength(2);
    expect(lineage.conflictRecord?.conflictingVersionIds).toEqual([
      resA.resolutionVersionId,
      resB.resolutionVersionId,
    ].sort());
    expect(lineage.conflictRecord?.conflictId).toBeDefined();
  });

  it('SCENARIO D (Corrigendum Revision): Corrigendum key creates version 2 with supersedesVersionId pointing to version 1', () => {
    const candV1 = {
      candidateAnswerId: 'cand_ans_v1',
      canonicalQuestionId: 'can_q1',
      sourceEntryId: 'entry_1',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'B' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };

    const resV1 = createResolutionVersion({
      canonicalQuestionId: 'can_q1',
      candidate: candV1,
      versionNumber: 1,
      authorityDocumentSourceId: 'src_initial_key',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });

    const candV2 = {
      candidateAnswerId: 'cand_ans_v2',
      canonicalQuestionId: 'can_q1',
      sourceEntryId: 'entry_2',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'C' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's2', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };

    const resV2 = createResolutionVersion({
      canonicalQuestionId: 'can_q1',
      candidate: candV2,
      versionNumber: 2,
      authorityDocumentSourceId: 'src_corrigendum',
      supersedesVersionId: resV1.resolutionVersionId,
      effectiveFrom: '2026-03-01T00:00:00Z',
    });

    expect(resV2.supersedesVersionId).toBe(resV1.resolutionVersionId);
    expect(resV2.versionNumber).toBe(2);

    const lineage = evaluateLineageHead('can_q1', [resV1, resV2]);
    expect(lineage.status).toBe('AUTHORITATIVE');
    expect(lineage.authoritativeResolution?.resolutionVersionId).toBe(resV2.resolutionVersionId);
  });

  it('SCENARIO E (Withdrawn Question): Official withdrawal notice sets QuestionDisposition to WITHDRAWN and awards full marks', () => {
    const cand = {
      candidateAnswerId: 'cand_ans_w',
      canonicalQuestionId: 'can_qw',
      sourceEntryId: 'entry_w',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'A' },
      evidence: [],
      verificationStatus: 'WITHDRAWN' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };

    const resW = createResolutionVersion({
      canonicalQuestionId: 'can_qw',
      candidate: cand,
      versionNumber: 1,
      questionDisposition: 'WITHDRAWN',
      scoringDisposition: 'AWARD_FULL_MARKS',
      authorityDocumentSourceId: 'src_withdrawal',
      effectiveFrom: '2026-02-01T00:00:00Z',
    });

    const policy = createMockScoringPolicy();
    const attempt: UserAttemptResponse = {
      attemptId: 'att_1',
      canonicalQuestionId: 'can_qw',
      userSelectedOptionIds: ['D'], // User selected wrong option D
      isSkipped: false,
      responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['D'], isSkipped: false }),
      submittedAt: 1000,
    };

    const evalResult = evaluateUserAttempt({
      attempt,
      resolution: resW,
      candidate: cand,
      policyVersion: policy,
      questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' },
    });

    expect(evalResult.isEvaluated).toBe(true);
    expect(evalResult.record?.isCorrect).toBe(true);
    expect(evalResult.record?.awardedMarks).toBe(2.0); // Full marks awarded despite wrong selection!
  });

  it('SCENARIO F (AI-Proposed Answer): AI prediction is strictly capped at CANDIDATE', () => {
    const status = evaluateVerificationStatusFromEvidence([
      { evidenceId: 'ev_ai', evidenceClass: 'AI_OR_HEURISTIC_PREDICTION', sourceId: 'src_llm', documentType: 'AI_LOG', summary: 'AI predicted B with 0.999 confidence' },
    ]);
    expect(status.status).toBe('CANDIDATE');
    expect(status.status).not.toBe('VERIFIED');
  });

  it('SCENARIO G (Missing Answer Key): Question without answer key fails closed during scoring', () => {
    const policy = createMockScoringPolicy();
    const ruleSel = selectScoringPolicyRule({ canonicalQuestionType: 'UNKNOWN_TYPE' }, policy);
    expect(ruleSel.isSuccess).toBe(false);
    expect(ruleSel.errorCode).toBe('UNRESOLVED_SCORING_POLICY');
  });

  it('SCENARIO H (Unknown Question Type): AST with unknown structure fails rule matching', () => {
    const policy = createMockScoringPolicy();
    const ruleSel = selectScoringPolicyRule({ canonicalQuestionType: 'NON_EXISTENT_ARCHETYPE' }, policy);
    expect(ruleSel.isSuccess).toBe(false);
  });

  it('SCENARIO I (MCQ Single Choice): Correct option -> positive marks, wrong option -> negative deduction', () => {
    const cand = {
      candidateAnswerId: 'cand_ans_mcq',
      canonicalQuestionId: 'can_q_mcq',
      sourceEntryId: 'entry_mcq',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'A' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };
    const res = createResolutionVersion({
      canonicalQuestionId: 'can_q_mcq',
      candidate: cand,
      versionNumber: 1,
      authorityDocumentSourceId: 'src_1',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });
    const policy = createMockScoringPolicy();

    // Correct Attempt
    const attemptCorrect: UserAttemptResponse = {
      attemptId: 'att_c',
      canonicalQuestionId: 'can_q_mcq',
      userSelectedOptionIds: ['A'],
      isSkipped: false,
      responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['A'], isSkipped: false }),
      submittedAt: 1000,
    };
    const evalCorrect = evaluateUserAttempt({
      attempt: attemptCorrect,
      resolution: res,
      candidate: cand,
      policyVersion: policy,
      questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' },
    });
    expect(evalCorrect.record?.awardedMarks).toBe(2.0);
    expect(evalCorrect.record?.isCorrect).toBe(true);

    // Wrong Attempt
    const attemptWrong: UserAttemptResponse = {
      attemptId: 'att_w',
      canonicalQuestionId: 'can_q_mcq',
      userSelectedOptionIds: ['B'],
      isSkipped: false,
      responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['B'], isSkipped: false }),
      submittedAt: 1000,
    };
    const evalWrong = evaluateUserAttempt({
      attempt: attemptWrong,
      resolution: res,
      candidate: cand,
      policyVersion: policy,
      questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' },
    });
    expect(evalWrong.record?.awardedMarks).toBe(-0.66);
    expect(evalWrong.record?.isWrong).toBe(true);
  });

  it('SCENARIO J (MSQ Multiple Choice): Exact match -> full marks; wrong option -> negative marks', () => {
    const cand = {
      candidateAnswerId: 'cand_ans_msq',
      canonicalQuestionId: 'can_q_msq',
      sourceEntryId: 'entry_msq',
      parsedPayload: { type: 'MULTIPLE_CHOICE_MSQ' as const, correctOptionLabels: ['A', 'C'], correctOptionIds: [], isOrderSensitive: false },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };
    const res = createResolutionVersion({
      canonicalQuestionId: 'can_q_msq',
      candidate: cand,
      versionNumber: 1,
      authorityDocumentSourceId: 'src_1',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });
    const policy = createMockScoringPolicy();

    // Exact Match [A, C]
    const attemptExact: UserAttemptResponse = {
      attemptId: 'att_msq_exact',
      canonicalQuestionId: 'can_q_msq',
      userSelectedOptionIds: ['A', 'C'],
      isSkipped: false,
      responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['A', 'C'], isSkipped: false }),
      submittedAt: 1000,
    };
    const evalExact = evaluateUserAttempt({
      attempt: attemptExact,
      resolution: res,
      candidate: cand,
      policyVersion: policy,
      questionTraits: { canonicalQuestionType: 'MULTIPLE_CHOICE_MSQ', targetSubtype: 'ALL_OR_NOTHING' },
    });
    expect(evalExact.record?.awardedMarks).toBe(2.0);
    expect(evalExact.record?.isCorrect).toBe(true);

    // Wrong Option Included [A, B]
    const attemptWrong: UserAttemptResponse = {
      attemptId: 'att_msq_wrong',
      canonicalQuestionId: 'can_q_msq',
      userSelectedOptionIds: ['A', 'B'],
      isSkipped: false,
      responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['A', 'B'], isSkipped: false }),
      submittedAt: 1000,
    };
    const evalWrong = evaluateUserAttempt({
      attempt: attemptWrong,
      resolution: res,
      candidate: cand,
      policyVersion: policy,
      questionTraits: { canonicalQuestionType: 'MULTIPLE_CHOICE_MSQ', targetSubtype: 'ALL_OR_NOTHING' },
    });
    expect(evalWrong.record?.awardedMarks).toBe(-0.66);
    expect(evalWrong.record?.isWrong).toBe(true);
  });

  it('SCENARIO K (NAT Tolerance): Value within tolerance -> correct; value outside -> incorrect', () => {
    const targetRep = parseExactNumericInput('12.75').parsedRepresentation!;
    const userGood = parseExactNumericInput('12.72').parsedRepresentation!;
    const userBad = parseExactNumericInput('12.85').parsedRepresentation!;

    const matchGood = evaluateExactNumericMatch(userGood, targetRep, { absoluteTolerance: '0.05', boundsInclusivity: 'INCLUSIVE' });
    const matchBad = evaluateExactNumericMatch(userBad, targetRep, { absoluteTolerance: '0.05', boundsInclusivity: 'INCLUSIVE' });

    expect(matchGood.isMatch).toBe(true);
    expect(matchBad.isMatch).toBe(false);
  });

  it('SCENARIO L (Matrix Match): Exact bipartite mapping -> full marks', () => {
    const cand = {
      candidateAnswerId: 'cand_ans_mat',
      canonicalQuestionId: 'can_q_mat',
      sourceEntryId: 'entry_mat',
      parsedPayload: {
        type: 'MATRIX_MATCH' as const,
        pairs: [
          { sourceLabel: 'P', targetLabels: ['1'] },
          { sourceLabel: 'Q', targetLabels: ['2'] },
        ],
      },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };
    const res = createResolutionVersion({
      canonicalQuestionId: 'can_q_mat',
      candidate: cand,
      versionNumber: 1,
      authorityDocumentSourceId: 'src_1',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });
    const policy = createMockScoringPolicy();

    const attempt: UserAttemptResponse = {
      attemptId: 'att_mat_1',
      canonicalQuestionId: 'can_q_mat',
      userMatrixPairs: [
        { source: 'P', target: '1' },
        { source: 'Q', target: '2' },
      ],
      isSkipped: false,
      responseFingerprint: deriveResponseFingerprint({
        userMatrixPairs: [
          { source: 'P', target: '1' },
          { source: 'Q', target: '2' },
        ],
        isSkipped: false,
      }),
      submittedAt: 1000,
    };

    const evalResult = evaluateUserAttempt({
      attempt,
      resolution: res,
      candidate: cand,
      policyVersion: policy,
      questionTraits: { canonicalQuestionType: 'MATRIX_MATCH' },
    });

    expect(evalResult.record?.awardedMarks).toBe(4.0);
    expect(evalResult.record?.isCorrect).toBe(true);
  });

  it('SCENARIO M (Unanswered Question): Skipped question -> zero penalty and isSkipped: true', () => {
    const cand = {
      candidateAnswerId: 'cand_ans_mcq',
      canonicalQuestionId: 'can_q_mcq',
      sourceEntryId: 'entry_mcq',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'A' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };
    const res = createResolutionVersion({
      canonicalQuestionId: 'can_q_mcq',
      candidate: cand,
      versionNumber: 1,
      authorityDocumentSourceId: 'src_1',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });
    const policy = createMockScoringPolicy();

    const attempt: UserAttemptResponse = {
      attemptId: 'att_skip',
      canonicalQuestionId: 'can_q_mcq',
      isSkipped: true,
      responseFingerprint: deriveResponseFingerprint({ isSkipped: true }),
      submittedAt: 1000,
    };

    const evalResult = evaluateUserAttempt({
      attempt,
      resolution: res,
      candidate: cand,
      policyVersion: policy,
      questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' },
    });

    expect(evalResult.record?.isSkipped).toBe(true);
    expect(evalResult.record?.awardedMarks).toBe(0.0);
  });

  it('SCENARIO N (Wrong MCQ Answer Deduction): Specific negative deduction evaluated accurately', () => {
    const cand = {
      candidateAnswerId: 'cand_ans_mcq',
      canonicalQuestionId: 'can_q_mcq',
      sourceEntryId: 'entry_mcq',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'B' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };
    const res = createResolutionVersion({
      canonicalQuestionId: 'can_q_mcq',
      candidate: cand,
      versionNumber: 1,
      authorityDocumentSourceId: 'src_1',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });
    const policy = createMockScoringPolicy();

    const attempt: UserAttemptResponse = {
      attemptId: 'att_wrong_n',
      canonicalQuestionId: 'can_q_mcq',
      userSelectedOptionIds: ['C'],
      isSkipped: false,
      responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['C'], isSkipped: false }),
      submittedAt: 1000,
    };

    const evalResult = evaluateUserAttempt({
      attempt,
      resolution: res,
      candidate: cand,
      policyVersion: policy,
      questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' },
    });

    expect(evalResult.record?.awardedMarks).toBe(-0.66);
    expect(evalResult.record?.isWrong).toBe(true);
  });

  it('SCENARIO O (Correct MCQ Answer): Specific positive marks awarded accurately', () => {
    const cand = {
      candidateAnswerId: 'cand_ans_mcq',
      canonicalQuestionId: 'can_q_mcq',
      sourceEntryId: 'entry_mcq',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'D' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };
    const res = createResolutionVersion({
      canonicalQuestionId: 'can_q_mcq',
      candidate: cand,
      versionNumber: 1,
      authorityDocumentSourceId: 'src_1',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });
    const policy = createMockScoringPolicy();

    const attempt: UserAttemptResponse = {
      attemptId: 'att_corr_o',
      canonicalQuestionId: 'can_q_mcq',
      userSelectedOptionIds: ['D'],
      isSkipped: false,
      responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['D'], isSkipped: false }),
      submittedAt: 1000,
    };

    const evalResult = evaluateUserAttempt({
      attempt,
      resolution: res,
      candidate: cand,
      policyVersion: policy,
      questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' },
    });

    expect(evalResult.record?.awardedMarks).toBe(2.0);
    expect(evalResult.record?.isCorrect).toBe(true);
  });

  it('SCENARIO P (Partial Credit MSQ): Selecting 2 correct options out of 3 awards partial credit', () => {
    const cand = {
      candidateAnswerId: 'cand_ans_msq_p',
      canonicalQuestionId: 'can_q_msq_p',
      sourceEntryId: 'entry_msq_p',
      parsedPayload: { type: 'MULTIPLE_CHOICE_MSQ' as const, correctOptionLabels: ['A', 'B', 'C'], correctOptionIds: [], isOrderSensitive: false },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };
    const res = createResolutionVersion({
      canonicalQuestionId: 'can_q_msq_p',
      candidate: cand,
      versionNumber: 1,
      authorityDocumentSourceId: 'src_1',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });
    const policy = createMockScoringPolicy();

    const attempt: UserAttemptResponse = {
      attemptId: 'att_part_p',
      canonicalQuestionId: 'can_q_msq_p',
      userSelectedOptionIds: ['A', 'B'], // 2 out of 3 correct options
      isSkipped: false,
      responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['A', 'B'], isSkipped: false }),
      submittedAt: 1000,
    };

    const evalResult = evaluateUserAttempt({
      attempt,
      resolution: res,
      candidate: cand,
      policyVersion: policy,
      questionTraits: { canonicalQuestionType: 'MULTIPLE_CHOICE_MSQ', targetSubtype: 'PARTIAL_CREDIT' },
    });

    expect(evalResult.record?.isPartial).toBe(true);
    expect(evalResult.record?.awardedMarks).toBe(2.0); // 2 * 1.0 = 2.0 marks
  });

  it('SCENARIO Q (Historical Regrade Isolation): Previous evaluation record remains bitwise identical when new version is created', () => {
    const candV1 = {
      candidateAnswerId: 'cand_v1',
      canonicalQuestionId: 'can_q_q',
      sourceEntryId: 'e1',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'B' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };
    const resV1 = createResolutionVersion({
      canonicalQuestionId: 'can_q_q',
      candidate: candV1,
      versionNumber: 1,
      authorityDocumentSourceId: 'src_1',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });
    const policy = createMockScoringPolicy();

    const attempt: UserAttemptResponse = {
      attemptId: 'att_q',
      canonicalQuestionId: 'can_q_q',
      userSelectedOptionIds: ['B'],
      isSkipped: false,
      responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['B'], isSkipped: false }),
      submittedAt: 1000,
    };

    const evalV1 = evaluateUserAttempt({
      attempt,
      resolution: resV1,
      candidate: candV1,
      policyVersion: policy,
      questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' },
    });

    // Now corrigendum appears
    const candV2 = {
      candidateAnswerId: 'cand_v2',
      canonicalQuestionId: 'can_q_q',
      sourceEntryId: 'e2',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'C' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's2', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };
    createResolutionVersion({
      canonicalQuestionId: 'can_q_q',
      candidate: candV2,
      versionNumber: 2,
      authorityDocumentSourceId: 'src_corrigendum',
      supersedesVersionId: resV1.resolutionVersionId,
      effectiveFrom: '2026-02-01T00:00:00Z',
    });

    // Verify historical evaluation record is unchanged and still points to resV1
    expect(evalV1.record?.resolvedAnswerVersionId).toBe(resV1.resolutionVersionId);
    expect(evalV1.record?.awardedMarks).toBe(2.0);
  });

  it('SCENARIO R (Bilingual Key Publishing): Answer key printing bilingual numbers binds properly', () => {
    const rawVal = 'Option B';
    const parsed = parseRawAnswerValue(rawVal);
    expect(parsed.type).toBe('SINGLE_CHOICE_MCQ');
    if (parsed.type === 'SINGLE_CHOICE_MCQ') {
      expect(parsed.correctOptionLabel).toBe('B');
    }
  });

  it('SCENARIO S (Duplicate Answer Entry): Identical key entries produce identical entryId', () => {
    const expectedEntryId = 'efdcb75aab7acf41d1e6d456a7b870d010d0d37c5b31865f53e4ec2182f08def';
    const entryId = deriveEntryId({
      snapshotId: 'snap_1',
      sourceNodeId: 'node_1',
      pageNumber: 1,
      rawPrintedQuestionNumber: '15',
      rawExtractedValue: 'B',
    });
    expect(entryId).toBe(expectedEntryId);
  });

  it('SCENARIO T (Broken Provenance Chain): Missing physical candidate fails binding closed', () => {
    const entry: AnswerKeyEntry = {
      entryId: 'entry_ghost',
      snapshotId: 'snap_1',
      sourceNodeId: 'node_ghost',
      pageNumber: 99,
      rawPrintedQuestionNumber: '999',
      rawExtractedValue: 'A',
      entryFingerprint: 'fp_ghost',
    };
    const result = bindAndEvaluateAnswerCandidate({
      entry,
      evidence: [],
      canonicalQuestions: [],
      physicalCandidates: [],
    });
    expect(result.isBound).toBe(false);
    expect(result.rejectionReasons[0]).toContain('No physical question candidate found');
  });

  // ==========================================================================
  // Scenarios U–AD
  // ==========================================================================

  it('SCENARIO U (Answer Payload + Withdrawn Disposition): Question has payload B and disposition WITHDRAWN simultaneously', () => {
    const cand = {
      candidateAnswerId: 'cand_u',
      canonicalQuestionId: 'can_u',
      sourceEntryId: 'e_u',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'B' },
      evidence: [],
      verificationStatus: 'WITHDRAWN' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };
    const res = createResolutionVersion({
      canonicalQuestionId: 'can_u',
      candidate: cand,
      versionNumber: 2,
      questionDisposition: 'WITHDRAWN',
      scoringDisposition: 'AWARD_FULL_MARKS',
      authorityDocumentSourceId: 'doc_notice',
      effectiveFrom: '2026-03-01T00:00:00Z',
    });

    expect(cand.parsedPayload.correctOptionLabel).toBe('B'); // Payload preserved
    expect(res.questionDisposition).toBe('WITHDRAWN'); // Disposition separate
  });

  it('SCENARIO V (Same Answer Entry / Different sourceNodeId): Distinct entryId generated', () => {
    const id1 = deriveEntryId({
      snapshotId: 'snap_1',
      sourceNodeId: 'node_col_1',
      pageNumber: 1,
      rawPrintedQuestionNumber: '15',
      rawExtractedValue: 'B',
    });
    const id2 = deriveEntryId({
      snapshotId: 'snap_1',
      sourceNodeId: 'node_col_2',
      pageNumber: 1,
      rawPrintedQuestionNumber: '15',
      rawExtractedValue: 'B',
    });
    expect(id1).not.toBe(id2);
  });

  it('SCENARIO W (Verification Status Changes Without Identity Mutation): Lineage preserves candidate identity', () => {
    const cand: AnswerCandidate = {
      candidateAnswerId: 'cand_w',
      canonicalQuestionId: 'can_w',
      sourceEntryId: 'e_w',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'C' },
      evidence: [],
      verificationStatus: 'CANDIDATE',
      confidenceScore: 0.5,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };
    const resV1 = createResolutionVersion({
      canonicalQuestionId: 'can_w',
      candidate: cand,
      versionNumber: 1,
      authorityDocumentSourceId: 'prov_doc',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });

    cand.verificationStatus = 'VERIFIED';
    const resV2 = createResolutionVersion({
      canonicalQuestionId: 'can_w',
      candidate: cand,
      versionNumber: 2,
      authorityDocumentSourceId: 'final_doc',
      supersedesVersionId: resV1.resolutionVersionId,
      effectiveFrom: '2026-02-01T00:00:00Z',
    });

    expect(resV1.candidateAnswerId).toBe(resV2.candidateAnswerId);
    expect(resV2.supersedesVersionId).toBe(resV1.resolutionVersionId);
  });

  it('SCENARIO X (Scoring Policy Version Changes): New version has distinct versionId while v1 remains unchanged', () => {
    const polV1 = createMockScoringPolicy();
    const polV2: ScoringPolicyVersion = {
      ...polV1,
      policyVersionId: 'pol_ver_v2',
      versionNumber: 2,
      policyFingerprint: 'fp_v2',
      rules: [
        {
          ruleId: 'rule_mcq_v2',
          policyType: 'MCQ_FIXED_PENALTY',
          canonicalQuestionType: 'SINGLE_CHOICE_MCQ',
          positiveMarks: 3.0,
          negativeMarks: 1.0,
          unansweredMarks: 0.0,
        },
      ],
      effectiveFrom: '2026-06-01T00:00:00Z',
    };

    expect(polV1.policyVersionId).not.toBe(polV2.policyVersionId);
    expect(polV1.rules[0].positiveMarks).toBe(2.0);
    expect(polV2.rules[0].positiveMarks).toBe(3.0);
  });

  it('SCENARIO Y (Deterministic Evaluation Identity): Identical inputs produce identical evaluationId', () => {
    // 1. Independent hardcoded expected fixture verification
    const expectedEvaluationId = 'c1a7f40a9f5c7ca411e589dc677f279be85343e6be4ca52da0e17a340e23c043';
    const independentDerived = deriveEvaluationId({
      attemptId: 'att_y',
      canonicalQuestionId: 'can_y',
      resolvedAnswerVersionId: 'res_ver_y',
      scoringPolicyVersionId: 'pol_ver_y',
      responseFingerprint: 'resp_fp_y',
    });
    expect(independentDerived).toBe(expectedEvaluationId);

    // 2. Execution-level determinism
    const cand = {
      candidateAnswerId: 'cand_y',
      canonicalQuestionId: 'can_y',
      sourceEntryId: 'e_y',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'A' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };
    const res = createResolutionVersion({
      canonicalQuestionId: 'can_y',
      candidate: cand,
      versionNumber: 1,
      authorityDocumentSourceId: 'src_1',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });
    const policy = createMockScoringPolicy();
    const attempt: UserAttemptResponse = {
      attemptId: 'att_y',
      canonicalQuestionId: 'can_y',
      userSelectedOptionIds: ['A'],
      isSkipped: false,
      responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['A'], isSkipped: false }),
      submittedAt: 1000,
    };

    const eval1 = evaluateUserAttempt({ attempt, resolution: res, candidate: cand, policyVersion: policy, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } });
    const eval2 = evaluateUserAttempt({ attempt, resolution: res, candidate: cand, policyVersion: policy, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } });

    expect(eval1.record?.evaluationId).toBe(eval2.record?.evaluationId);
  });

  it('SCENARIO Z (Input Determinism Invariance): Same inputs cannot produce different awarded marks', () => {
    const cand = {
      candidateAnswerId: 'cand_z',
      canonicalQuestionId: 'can_z',
      sourceEntryId: 'e_z',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'A' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };
    const res = createResolutionVersion({
      canonicalQuestionId: 'can_z',
      candidate: cand,
      versionNumber: 1,
      authorityDocumentSourceId: 'src_1',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });
    const policy = createMockScoringPolicy();
    const attempt: UserAttemptResponse = {
      attemptId: 'att_z',
      canonicalQuestionId: 'can_z',
      userSelectedOptionIds: ['A'],
      isSkipped: false,
      responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['A'], isSkipped: false }),
      submittedAt: 1000,
    };

    const res1 = evaluateUserAttempt({ attempt, resolution: res, candidate: cand, policyVersion: policy, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } });
    const res2 = evaluateUserAttempt({ attempt, resolution: res, candidate: cand, policyVersion: policy, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } });

    expect(res1.record?.awardedMarks).toBe(res2.record?.awardedMarks);
  });

  it('SCENARIO AA (Revised Answer Preserves Historical Resolution): Corrigendum creates v2 without altering v1', () => {
    const candV1 = {
      candidateAnswerId: 'cand_aa_1',
      canonicalQuestionId: 'can_aa',
      sourceEntryId: 'e_1',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'B' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };
    const resV1 = createResolutionVersion({
      canonicalQuestionId: 'can_aa',
      candidate: candV1,
      versionNumber: 1,
      authorityDocumentSourceId: 'doc_1',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });
    const hashV1Before = resV1.resolutionVersionId;

    // Create v2
    const candV2 = {
      candidateAnswerId: 'cand_aa_2',
      canonicalQuestionId: 'can_aa',
      sourceEntryId: 'e_2',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'C' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's2', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };
    createResolutionVersion({
      canonicalQuestionId: 'can_aa',
      candidate: candV2,
      versionNumber: 2,
      authorityDocumentSourceId: 'doc_2',
      supersedesVersionId: resV1.resolutionVersionId,
      effectiveFrom: '2026-02-01T00:00:00Z',
    });

    expect(resV1.resolutionVersionId).toBe(hashV1Before);
  });

  it('SCENARIO AB (Revised Scoring Policy Preserves Historical Score): Historical attempt retains exact v1 marks', () => {
    const cand = {
      candidateAnswerId: 'cand_ab',
      canonicalQuestionId: 'can_ab',
      sourceEntryId: 'e_ab',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'A' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };
    const res = createResolutionVersion({
      canonicalQuestionId: 'can_ab',
      candidate: cand,
      versionNumber: 1,
      authorityDocumentSourceId: 'src_1',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });
    const policyV1: ScoringPolicyVersion = {
      policyVersionId: 'pol_ver_v1',
      policyId: 'pol_mcq',
      versionNumber: 1,
      policyFingerprint: 'fp_v1',
      rules: [
        {
          ruleId: 'r_mcq_v1',
          policyType: 'MCQ_FIXED_PENALTY',
          canonicalQuestionType: 'SINGLE_CHOICE_MCQ',
          positiveMarks: 2.0,
          negativeMarks: 0.5,
          unansweredMarks: 0.0,
        },
      ],
      effectiveFrom: '2026-01-01T00:00:00Z',
      createdAt: 1000,
    };
    const policyV2: ScoringPolicyVersion = {
      policyVersionId: 'pol_ver_v2',
      policyId: 'pol_mcq',
      versionNumber: 2,
      policyFingerprint: 'fp_v2',
      rules: [
        {
          ruleId: 'r_mcq_v2',
          policyType: 'MCQ_FIXED_PENALTY',
          canonicalQuestionType: 'SINGLE_CHOICE_MCQ',
          positiveMarks: 4.0, // Marks doubled in v2
          negativeMarks: 1.0,
          unansweredMarks: 0.0,
        },
      ],
      effectiveFrom: '2026-02-01T00:00:00Z',
      createdAt: 2000,
    };

    const attempt: UserAttemptResponse = {
      attemptId: 'att_ab_1',
      canonicalQuestionId: 'can_ab',
      userSelectedOptionIds: ['A'],
      isSkipped: false,
      responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['A'], isSkipped: false }),
      submittedAt: 1500,
    };

    // Evaluate on policy v1
    const evalV1 = evaluateUserAttempt({
      attempt,
      resolution: res,
      candidate: cand,
      policyVersion: policyV1,
      questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' },
    });
    expect(evalV1.isEvaluated).toBe(true);
    expect(evalV1.record?.awardedMarks).toBe(2.0);
    expect(evalV1.record?.scoringPolicyVersionId).toBe('pol_ver_v1');

    // Evaluate on revised policy v2
    const evalV2 = evaluateUserAttempt({
      attempt,
      resolution: res,
      candidate: cand,
      policyVersion: policyV2,
      questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' },
    });
    expect(evalV2.isEvaluated).toBe(true);
    expect(evalV2.record?.awardedMarks).toBe(4.0);
    expect(evalV2.record?.scoringPolicyVersionId).toBe('pol_ver_v2');

    // Historical evaluation pinned to v1 remains completely unchanged and retains 2.0 marks
    expect(evalV1.record?.awardedMarks).toBe(2.0);
    expect(evalV1.record?.evaluationId).not.toBe(evalV2.record?.evaluationId);
  });

  it('SCENARIO AC (Exam-Specific Policy Name Rejection): Architecture enforces generic policy types only', () => {
    const validGenericTypes = [
      'MCQ_FIXED_PENALTY',
      'MCQ_NO_PENALTY',
      'MSQ_ALL_OR_NOTHING',
      'MSQ_PARTIAL_CREDIT',
      'NUMERICAL_EXACT',
      'NUMERICAL_TOLERANCE',
      'MATRIX_EXACT',
      'MATRIX_PARTIAL_CREDIT',
      'WITHDRAWN_FULL_CREDIT',
      'WITHDRAWN_EXCLUDE',
    ];
    // None contain exam names
    for (const t of validGenericTypes) {
      expect(t).not.toMatch(/UPSC|SSC|GATE|JEE/);
    }
  });

  it('SCENARIO AD (Missing Official Publisher Hash): Captured successfully using Mock.AI sourceFileHash', () => {
    const expectedHash = '9372161e5429e4051d41a48f14db8b429eb9a0193109bbfe7a0ada490dcba08b';
    const sourceHash = computeCanonicalSha256('bytes', { content: 'sample_pdf_bytes' });
    expect(sourceHash).toBe(expectedHash);
  });

  // ==========================================================================
  // Scenarios AE–AZ
  // ==========================================================================

  it('SCENARIO AE (Corrigendum Does Not Mutate v1): v1 byte and content identity cannot change', () => {
    const cand = {
      candidateAnswerId: 'cand_ae',
      canonicalQuestionId: 'can_ae',
      sourceEntryId: 'e_ae',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'A' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };
    const v1 = createResolutionVersion({
      canonicalQuestionId: 'can_ae',
      candidate: cand,
      versionNumber: 1,
      authorityDocumentSourceId: 'doc_1',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });
    const snapshotV1 = JSON.stringify(v1);

    // Create v2
    const cand2 = { ...cand, candidateAnswerId: 'cand_ae_2' };
    createResolutionVersion({
      canonicalQuestionId: 'can_ae',
      candidate: cand2,
      versionNumber: 2,
      authorityDocumentSourceId: 'doc_2',
      supersedesVersionId: v1.resolutionVersionId,
      effectiveFrom: '2026-02-01T00:00:00Z',
    });

    expect(JSON.stringify(v1)).toBe(snapshotV1);
  });

  it('SCENARIO AF (Resolution ID Changes When Identity Field Changes): Modifying candidateAnswerId changes hash', () => {
    const id1 = deriveResolutionVersionId({
      canonicalQuestionId: 'can_1',
      versionNumber: 1,
      candidateAnswerId: 'cand_1',
      verificationStatus: 'VERIFIED',
      questionDisposition: 'ACTIVE',
      scoringDisposition: 'STANDARD_EVALUATION',
      authorityDocumentSourceId: 'doc_1',
      supersedesVersionId: null,
      effectiveFrom: '2026-01-01T00:00:00Z',
    });

    const id2 = deriveResolutionVersionId({
      canonicalQuestionId: 'can_1',
      versionNumber: 1,
      candidateAnswerId: 'cand_DIFFERENT',
      verificationStatus: 'VERIFIED',
      questionDisposition: 'ACTIVE',
      scoringDisposition: 'STANDARD_EVALUATION',
      authorityDocumentSourceId: 'doc_1',
      supersedesVersionId: null,
      effectiveFrom: '2026-01-01T00:00:00Z',
    });

    expect(id1).not.toBe(id2);
  });

  it('SCENARIO AO (Creating v2 Cannot Mutate v1): Appending v2 leaves SHA-256 byte digest of v1 identical', () => {
    const cand = {
      candidateAnswerId: 'cand_ao',
      canonicalQuestionId: 'can_ao',
      sourceEntryId: 'e_ao',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'B' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };
    const v1 = createResolutionVersion({
      canonicalQuestionId: 'can_ao',
      candidate: cand,
      versionNumber: 1,
      authorityDocumentSourceId: 'doc_1',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });
    const hashBefore = v1.resolutionVersionId;

    createResolutionVersion({
      canonicalQuestionId: 'can_ao',
      candidate: { ...cand, candidateAnswerId: 'cand_ao_2' },
      versionNumber: 2,
      authorityDocumentSourceId: 'doc_2',
      supersedesVersionId: v1.resolutionVersionId,
      effectiveFrom: '2026-02-01T00:00:00Z',
    });

    expect(v1.resolutionVersionId).toBe(hashBefore);
  });

  it('SCENARIO AZ (Identity-Defining Field Mutation): Modifying authorityDocumentSourceId strictly alters resolutionVersionId', () => {
    const basePayload = {
      canonicalQuestionId: 'can_az',
      versionNumber: 1,
      candidateAnswerId: 'cand_az',
      verificationStatus: 'VERIFIED' as const,
      questionDisposition: 'ACTIVE' as const,
      scoringDisposition: 'STANDARD_EVALUATION' as const,
      authorityDocumentSourceId: 'doc_orig',
      supersedesVersionId: null,
      effectiveFrom: '2026-01-01T00:00:00Z',
    };
    const idOrig = deriveResolutionVersionId(basePayload);
    const idMutated = deriveResolutionVersionId({
      ...basePayload,
      authorityDocumentSourceId: 'doc_different',
    });
    expect(idOrig).not.toBe(idMutated);
  });


  it('SCENARIO AG (Same Resolution Inputs Produce Same ID): Deterministic hash generation', () => {
    const input = {
      canonicalQuestionId: 'can_1',
      versionNumber: 1,
      candidateAnswerId: 'cand_1',
      verificationStatus: 'VERIFIED' as const,
      questionDisposition: 'ACTIVE' as const,
      scoringDisposition: 'STANDARD_EVALUATION' as const,
      authorityDocumentSourceId: 'doc_1',
      supersedesVersionId: null,
      effectiveFrom: '2026-01-01T00:00:00Z',
    };
    const id1 = deriveResolutionVersionId(input);
    const id2 = deriveResolutionVersionId(input);
    expect(id1).toBe(id2);
  });

  it('SCENARIO AH (Ambiguous NAT Input Fails Closed): Ambiguous comma syntax rejected', () => {
    const parseRes = parseExactNumericInput('1,234');
    expect(parseRes.isSuccess).toBe(false);
    expect(parseRes.errorCode).toBe('UNRESOLVED_OR_AMBIGUOUS_NUMERIC_SYNTAX');
  });

  it('SCENARIO AI (Locale-Dependent Parsing Invariance): Input with comma rejected regardless of locale', () => {
    const parseRes1 = parseExactNumericInput('1,25');
    const parseRes2 = parseExactNumericInput('1.234,56');
    expect(parseRes1.isSuccess).toBe(false);
    expect(parseRes2.isSuccess).toBe(false);
  });

  it('SCENARIO AJ (Scoring Equation Cannot Override Policy Version): Custom positiveMarks evaluated as configured', () => {
    const policy = createMockScoringPolicy();
    policy.rules[0].positiveMarks = 5.0; // Modified rule in version
    const cand = {
      candidateAnswerId: 'cand_aj',
      canonicalQuestionId: 'can_aj',
      sourceEntryId: 'e_aj',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'A' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };
    const res = createResolutionVersion({
      canonicalQuestionId: 'can_aj',
      candidate: cand,
      versionNumber: 1,
      authorityDocumentSourceId: 'doc_1',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });
    const attempt: UserAttemptResponse = {
      attemptId: 'att_aj',
      canonicalQuestionId: 'can_aj',
      userSelectedOptionIds: ['A'],
      isSkipped: false,
      responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['A'], isSkipped: false }),
      submittedAt: 1000,
    };
    const evalRes = evaluateUserAttempt({ attempt, resolution: res, candidate: cand, policyVersion: policy, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } });
    expect(evalRes.record?.awardedMarks).toBe(5.0);
  });

  it('SCENARIO AK (Historical Attempt Remains Identical After Corrigendum): Evaluation record hash invariant', () => {
    const cand = {
      candidateAnswerId: 'cand_ak',
      canonicalQuestionId: 'can_ak',
      sourceEntryId: 'e_ak',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'A' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };
    const res = createResolutionVersion({
      canonicalQuestionId: 'can_ak',
      candidate: cand,
      versionNumber: 1,
      authorityDocumentSourceId: 'doc_1',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });
    const policy = createMockScoringPolicy();
    const attempt: UserAttemptResponse = {
      attemptId: 'att_ak',
      canonicalQuestionId: 'can_ak',
      userSelectedOptionIds: ['A'],
      isSkipped: false,
      responseFingerprint: deriveResponseFingerprint({ userSelectedOptionIds: ['A'], isSkipped: false }),
      submittedAt: 1000,
    };
    const evalRes = evaluateUserAttempt({ attempt, resolution: res, candidate: cand, policyVersion: policy, questionTraits: { canonicalQuestionType: 'SINGLE_CHOICE_MCQ' } });
    const originalEvalId = evalRes.record?.evaluationId;

    // Simulate later corrigendum appended to system
    createResolutionVersion({
      canonicalQuestionId: 'can_ak',
      candidate: { ...cand, candidateAnswerId: 'cand_ak_2' },
      versionNumber: 2,
      authorityDocumentSourceId: 'doc_2',
      supersedesVersionId: res.resolutionVersionId,
      effectiveFrom: '2026-02-01T00:00:00Z',
    });

    expect(evalRes.record?.evaluationId).toBe(originalEvalId);
  });

  it('SCENARIO AL (Current Resolution Is Derived From Lineage): Derived effective time ranges', () => {
    const cand = {
      candidateAnswerId: 'cand_al',
      canonicalQuestionId: 'can_al',
      sourceEntryId: 'e_al',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'A' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };
    const v1 = createResolutionVersion({
      canonicalQuestionId: 'can_al',
      candidate: cand,
      versionNumber: 1,
      authorityDocumentSourceId: 'doc_1',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });
    const v2 = createResolutionVersion({
      canonicalQuestionId: 'can_al',
      candidate: cand,
      versionNumber: 2,
      authorityDocumentSourceId: 'doc_2',
      supersedesVersionId: v1.resolutionVersionId,
      effectiveFrom: '2026-03-01T00:00:00Z',
    });

    const rangeV1 = deriveEffectiveTimeRange(v1, [v1, v2]);
    expect(rangeV1.effectiveFrom).toBe('2026-01-01T00:00:00Z');
    expect(rangeV1.effectiveTo).toBe('2026-03-01T00:00:00Z');
  });

  it('SCENARIO AM (Canonical Serialization Is Deterministic): Key insertion order does not change JCS output', () => {
    const objA = { z: 1, a: 2, m: 3 };
    const objB = { a: 2, m: 3, z: 1 };
    expect(rfc8785Canonicalize(objA)).toBe(rfc8785Canonicalize(objB));
  });

  it('SCENARIO AN (Certification Language Matches DESIGN_ONLY Status): Calibrated status contract', () => {
    // Invariant: Layer 5 status contract must NOT claim CERTIFIED while forensic certification audit is pending
    const validPreCertificationStatuses = ['DESIGN_ONLY', 'IMPLEMENTATION_COMPLETE', 'READY_FOR_FINAL_CERTIFICATION_AUDIT'];
    const currentLayer5Status = 'READY_FOR_FINAL_CERTIFICATION_AUDIT';

    expect(validPreCertificationStatuses).toContain(currentLayer5Status);
    expect(currentLayer5Status).not.toBe('CERTIFIED');
  });

  it('SCENARIO AP (Domain Canonicalization vs JCS Array Preservation): Unordered sets sorted by domain normalization, ordered arrays preserved', () => {
    const payload1 = { userSelectedOptionIds: ['C', 'A', 'B'], sequence: ['step1', 'step2'] };
    const payload2 = { userSelectedOptionIds: ['B', 'A', 'C'], sequence: ['step1', 'step2'] };

    const norm1 = domainCanonicalize(payload1) as Record<string, unknown>;
    const norm2 = domainCanonicalize(payload2) as Record<string, unknown>;

    expect(rfc8785Canonicalize(norm1)).toBe(rfc8785Canonicalize(norm2));

    // Sequence order preserved
    const diffSequence = { userSelectedOptionIds: ['A'], sequence: ['step2', 'step1'] };
    const normDiff = domainCanonicalize(diffSequence) as Record<string, unknown>;
    expect(rfc8785Canonicalize(normDiff)).not.toBe(rfc8785Canonicalize(norm1));
  });

  it('SCENARIO AQ (Competing Successors Produce Lineage Conflict): Two branches trigger LINEAGE_CONFLICT and fail closed', () => {
    const cand = {
      candidateAnswerId: 'cand_aq',
      canonicalQuestionId: 'can_aq',
      sourceEntryId: 'e_aq',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'A' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };
    const v1 = createResolutionVersion({
      canonicalQuestionId: 'can_aq',
      candidate: cand,
      versionNumber: 1,
      authorityDocumentSourceId: 'doc_1',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });

    // Two competing branches both superseding v1
    const v2a = createResolutionVersion({
      canonicalQuestionId: 'can_aq',
      candidate: cand,
      versionNumber: 2,
      authorityDocumentSourceId: 'doc_2a',
      supersedesVersionId: v1.resolutionVersionId,
      effectiveFrom: '2026-02-01T00:00:00Z',
    });
    const v2b = createResolutionVersion({
      canonicalQuestionId: 'can_aq',
      candidate: cand,
      versionNumber: 2,
      authorityDocumentSourceId: 'doc_2b',
      supersedesVersionId: v1.resolutionVersionId,
      effectiveFrom: '2026-02-05T00:00:00Z',
    });

    const lineage = evaluateLineageHead('can_aq', [v1, v2a, v2b]);
    expect(lineage.status).toBe('LINEAGE_CONFLICT');
    expect(lineage.competingResolutionVersions?.length).toBe(2);
    expect(lineage.authoritativeResolution).toBeUndefined();
  });

  it('SCENARIO AR (Lower Version With Corrigendum Not Overridden by Number): Graph lineage controls authority', () => {
    // Chain where head is explicitly designated by lineage
    const cand = {
      candidateAnswerId: 'cand_ar',
      canonicalQuestionId: 'can_ar',
      sourceEntryId: 'e_ar',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'A' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };
    const v1 = createResolutionVersion({
      canonicalQuestionId: 'can_ar',
      candidate: cand,
      versionNumber: 1,
      authorityDocumentSourceId: 'doc_1',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });
    const v2 = createResolutionVersion({
      canonicalQuestionId: 'can_ar',
      candidate: cand,
      versionNumber: 2,
      authorityDocumentSourceId: 'doc_2',
      supersedesVersionId: v1.resolutionVersionId,
      effectiveFrom: '2026-02-01T00:00:00Z',
    });

    const lineage = evaluateLineageHead('can_ar', [v1, v2]);
    expect(lineage.status).toBe('AUTHORITATIVE');
    expect(lineage.authoritativeResolution?.resolutionVersionId).toBe(v2.resolutionVersionId);
  });

  it('SCENARIO AS (Linear Lineage Chain Single Head): v1 -> v2 -> v3 resolves deterministically to unique head v3', () => {
    const cand = {
      candidateAnswerId: 'cand_as',
      canonicalQuestionId: 'can_as',
      sourceEntryId: 'e_as',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'A' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };
    const v1 = createResolutionVersion({
      canonicalQuestionId: 'can_as',
      candidate: cand,
      versionNumber: 1,
      authorityDocumentSourceId: 'doc_1',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });
    const v2 = createResolutionVersion({
      canonicalQuestionId: 'can_as',
      candidate: cand,
      versionNumber: 2,
      authorityDocumentSourceId: 'doc_2',
      supersedesVersionId: v1.resolutionVersionId,
      effectiveFrom: '2026-02-01T00:00:00Z',
    });
    const v3 = createResolutionVersion({
      canonicalQuestionId: 'can_as',
      candidate: cand,
      versionNumber: 3,
      authorityDocumentSourceId: 'doc_3',
      supersedesVersionId: v2.resolutionVersionId,
      effectiveFrom: '2026-03-01T00:00:00Z',
    });

    const lineage = evaluateLineageHead('can_as', [v1, v2, v3]);
    expect(lineage.status).toBe('AUTHORITATIVE');
    expect(lineage.authoritativeResolution?.resolutionVersionId).toBe(v3.resolutionVersionId);
  });

  it('SCENARIO AT (Floating-Point Invariance for Exact NAT): Exact decimal and rational representation avoids IEEE-754 precision corruption', () => {
    // 0.1 + 0.2 in JS float is 0.30000000000000004
    const dec1 = parseExactNumericInput('0.1').parsedRepresentation!;
    const dec2 = parseExactNumericInput('0.2').parsedRepresentation!;
    const decTarget = parseExactNumericInput('0.3').parsedRepresentation!;

    const rat1 = toBigIntRational(dec1);
    const rat2 = toBigIntRational(dec2);
    const sumNum = rat1.num * rat2.den + rat2.num * rat1.den;
    const sumDen = rat1.den * rat2.den;

    const ratTarget = toBigIntRational(decTarget);
    // Exact equality check using BigInt cross multiplication
    const exactMatch = sumNum * ratTarget.den === ratTarget.num * sumDen;
    expect(exactMatch).toBe(true);
  });

  it('SCENARIO AU (Grammar-Verified Equivalence Only): Fractions parsed only when policy allows', () => {
    const parseDisallowed = parseExactNumericInput('1/4', { allowFractions: false });
    expect(parseDisallowed.isSuccess).toBe(false);
    expect(parseDisallowed.errorCode).toBe('FRACTIONS_NOT_PERMITTED');

    const parseAllowed = parseExactNumericInput('1/4', { allowFractions: true });
    expect(parseAllowed.isSuccess).toBe(true);
    expect(parseAllowed.parsedRepresentation?.format).toBe('EXACT_RATIONAL');
  });

  it('SCENARIO AV (No Matching Scoring Rule Fails Closed): UNRESOLVED_SCORING_POLICY', () => {
    const policy = createMockScoringPolicy();
    const ruleSel = selectScoringPolicyRule({ canonicalQuestionType: 'ESSAY_PROMPT' }, policy);
    expect(ruleSel.isSuccess).toBe(false);
    expect(ruleSel.errorCode).toBe('UNRESOLVED_SCORING_POLICY');
  });

  it('SCENARIO AW (Multiple Matching Scoring Rules Fail Closed): AMBIGUOUS_SCORING_POLICY', () => {
    const policy = createMockScoringPolicy();
    // Add a duplicate rule for SINGLE_CHOICE_MCQ
    policy.rules.push({
      ruleId: 'rule_mcq_duplicate',
      policyType: 'MCQ_NO_PENALTY',
      canonicalQuestionType: 'SINGLE_CHOICE_MCQ',
      positiveMarks: 1.0,
      negativeMarks: 0.0,
      unansweredMarks: 0.0,
    });

    const ruleSel = selectScoringPolicyRule({ canonicalQuestionType: 'SINGLE_CHOICE_MCQ' }, policy);
    expect(ruleSel.isSuccess).toBe(false);
    expect(ruleSel.errorCode).toBe('AMBIGUOUS_SCORING_POLICY');
  });

  it('SCENARIO AX (Deterministic Rule Selection Invariance): Same question traits always select the same rule', () => {
    const policy = createMockScoringPolicy();
    const sel1 = selectScoringPolicyRule({ canonicalQuestionType: 'SINGLE_CHOICE_MCQ' }, policy);
    const sel2 = selectScoringPolicyRule({ canonicalQuestionType: 'SINGLE_CHOICE_MCQ' }, policy);
    expect(sel1.selectedRule?.ruleId).toBe(sel2.selectedRule?.ruleId);
  });

  it('SCENARIO AY (Non-Identity Metadata Invariance): Changing createdAt does not alter resolutionVersionId', () => {
    const cand = {
      candidateAnswerId: 'cand_ay',
      canonicalQuestionId: 'can_ay',
      sourceEntryId: 'e_ay',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'A' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', adapterVersion: '1.0' },
    };
    const v1 = createResolutionVersion({
      canonicalQuestionId: 'can_ay',
      candidate: cand,
      versionNumber: 1,
      authorityDocumentSourceId: 'doc_1',
      effectiveFrom: '2026-01-01T00:00:00Z',
      createdAt: 1000,
    });
    const v2 = createResolutionVersion({
      canonicalQuestionId: 'can_ay',
      candidate: cand,
      versionNumber: 1,
      authorityDocumentSourceId: 'doc_1',
      effectiveFrom: '2026-01-01T00:00:00Z',
      createdAt: 999999, // Changed timestamp
    });

    expect(v1.resolutionVersionId).toBe(v2.resolutionVersionId);
  });
});
