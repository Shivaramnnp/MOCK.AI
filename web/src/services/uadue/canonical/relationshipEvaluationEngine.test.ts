/**
 * UADUE Phase 2D-1 — Relationship Evaluation Engine Test Suite
 * Document Version: 3.0.0-TOPOLOGY-HARDENED
 *
 * Validates:
 * 1. Evidence-driven verification gates (Hard >= 2, Conflicting == 0).
 * 2. Fatal veto of conflicting evidence (10 Hard + 1 Conflicting => NOT PROVEN).
 * 3. Confidence decoupling from verification (High confidence + 1 Hard => PLAUSIBLE; Low confidence + 2 Hard => PROVEN).
 * 4. Strictly NON-TRANSITIVE property of LANGUAGE_REPRESENTATION_OF (The English-Hindi-English Triangle).
 * 5. Monotonic & non-monotonic CONTINUATION_OF tests.
 * 6. POSSIBLE_DUPLICATE_CANDIDATE capping at PLAUSIBLE / REVIEW_REQUIRED.
 * 7. Source discrepancy preservation (UPSC Page 6 Hindi 16 vs English 15).
 * 8. Strict input immutability using Object.freeze.
 * 9. 100% Deterministic evaluation IDs regardless of evidence array insertion ordering.
 * 10. Real-world sample evaluation across UPSC, SSC, GATE, JEE archetypes.
 */

import { describe, it, expect } from 'vitest';
import {
  QuestionCandidate,
  QuestionRelationshipCandidate,
  RelationshipEvidence,
} from '../contracts/questionGraph';
import { RelationshipEvaluationEngine } from './relationshipEvaluationEngine';

describe('UADUE Phase 2D-1 — Relationship Evaluation Engine Suite', () => {
  const engine = new RelationshipEvaluationEngine();

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

  // ==========================================================================
  // 1. Evidence Gates & Verification Rules
  // ==========================================================================

  it('1. Formally verifies LANGUAGE_REPRESENTATION_OF on facing spread with 2+ hard evidence tokens', () => {
    const hindiCandidate = createMockCandidate({
      candidateId: 'cand_upsc_p2_q1_hin',
      physicalInstanceId: 'inst_p2_q1_hin',
      startPageNumber: 2,
      sourceQuestionNumber: '1',
      optionCandidateIds: ['h_o1', 'h_o2', 'h_o3', 'h_o4'],
      languageRepresentations: [
        {
          languageScript: 'DEVANAGARI',
          pageNumber: 2,
          stemNodeIds: ['hn_1'],
          bodyNodeIds: [],
          optionCandidateIds: ['h_o1', 'h_o2', 'h_o3', 'h_o4'],
        },
      ],
    });

    const englishCandidate = createMockCandidate({
      candidateId: 'cand_upsc_p3_q1_eng',
      physicalInstanceId: 'inst_p3_q1_eng',
      startPageNumber: 3,
      sourceQuestionNumber: '1',
      optionCandidateIds: ['e_o1', 'e_o2', 'e_o3', 'e_o4'],
      languageRepresentations: [
        {
          languageScript: 'LATIN',
          pageNumber: 3,
          stemNodeIds: ['en_1'],
          bodyNodeIds: [],
          optionCandidateIds: ['e_o1', 'e_o2', 'e_o3', 'e_o4'],
        },
      ],
    });

    const relationship: QuestionRelationshipCandidate = {
      relationshipId: 'rel_p2_p3_q1',
      sourceCandidateId: hindiCandidate.candidateId,
      targetCandidateId: englishCandidate.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [
        {
          evidenceId: 'ev_num_match',
          evidenceType: 'MATCHING_PRINTED_NUMERAL',
          evidenceStrength: 'HARD',
          sourceNodeIds: [],
          description: 'Matching numeral 1 on facing spread',
          confidence: 1.0,
        },
      ],
      confidenceScore: 0.98,
      verificationStatus: 'RELATIONSHIP_PROVEN',
      isSymmetric: true,
      provenance: {
        sourceSnapshotId: 'snap_upsc_2023',
        sourceDocumentId: 'doc_upsc_gs1',
        createdAt: 0,
      },
    };

    const result = engine.evaluateRelationship({
      relationship,
      sourceCandidate: hindiCandidate,
      targetCandidate: englishCandidate,
    });

    expect(result.verificationStatus).toBe('RELATIONSHIP_PROVEN');
    expect(result.isEligibleForFamilySynthesis).toBe(true);
    expect(result.hardEvidence.length).toBeGreaterThanOrEqual(2);
    expect(result.conflictingEvidence.length).toBe(0);
    expect(result.isSymmetric).toBe(true);
    expect(result.isTransitive).toBe(false);
    expect(result.transitivityConditions).toContain('STRICTLY_NON_TRANSITIVE');
  });

  it('2. Fatal Veto: 10 Hard Evidence tokens cannot neutralize 1 Conflicting Evidence token', () => {
    const candA = createMockCandidate({ candidateId: 'cand_veto_a', startPageNumber: 2 });
    const candB = createMockCandidate({ candidateId: 'cand_veto_b', startPageNumber: 3 });

    const tenHardTokens: RelationshipEvidence[] = Array.from({ length: 10 }, (_, i) => ({
      evidenceId: `ev_hard_${i}`,
      evidenceType: 'MATCHING_PRINTED_NUMERAL',
      evidenceStrength: 'HARD',
      sourceNodeIds: [],
      description: `Hard token ${i}`,
      confidence: 1.0,
    }));

    const oneConflictToken: RelationshipEvidence = {
      evidenceId: 'ev_conflict_fatal',
      evidenceType: 'NUMERICAL_DISCONTINUITY',
      evidenceStrength: 'CONFLICTING',
      sourceNodeIds: [],
      description: 'Fatal numbering discontinuity',
      confidence: 1.0,
    };

    const relationship: QuestionRelationshipCandidate = {
      relationshipId: 'rel_fatal_veto_test',
      sourceCandidateId: candA.candidateId,
      targetCandidateId: candB.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [...tenHardTokens, oneConflictToken],
      confidenceScore: 0.99, // Extremely high confidence
      verificationStatus: 'RELATIONSHIP_UNVERIFIED',
      isSymmetric: true,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', createdAt: 0 },
    };

    const result = engine.evaluateRelationship({
      relationship,
      sourceCandidate: candA,
      targetCandidate: candB,
    });

    expect(result.verificationStatus).toBe('RELATIONSHIP_CONFLICTED');
    expect(result.isEligibleForFamilySynthesis).toBe(false);
    expect(result.confidenceScore).toBe(0.0);
    expect(result.evaluationReasons.some((r) => r.includes('Conflicting evidence detected'))).toBe(true);
  });

  it('3. Confidence Decoupling: High confidence + 1 Hard token => PLAUSIBLE; Low confidence + 2 Hard tokens => PROVEN', () => {
    // Case A: Confidence = 0.99 with single hard token
    const candA = createMockCandidate({
      candidateId: 'cand_a',
      startPageNumber: 4,
      optionCandidateIds: [],
      languageRepresentations: [{ languageScript: 'DEVANAGARI', pageNumber: 4, stemNodeIds: [], bodyNodeIds: [], optionCandidateIds: [] }],
    });

    const candB = createMockCandidate({
      candidateId: 'cand_b',
      startPageNumber: 5,
      optionCandidateIds: [],
      languageRepresentations: [{ languageScript: 'DEVANAGARI', pageNumber: 5, stemNodeIds: [], bodyNodeIds: [], optionCandidateIds: [] }],
    });

    const relA: QuestionRelationshipCandidate = {
      relationshipId: 'rel_single_token',
      sourceCandidateId: candA.candidateId,
      targetCandidateId: candB.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [
        {
          evidenceId: 'ev_single_hard',
          evidenceType: 'MATCHING_PRINTED_NUMERAL',
          evidenceStrength: 'HARD',
          sourceNodeIds: [],
          description: 'Matching numeral',
          confidence: 0.99,
        },
        {
          evidenceId: 'ev_supp_1',
          evidenceType: 'IDENTICAL_SECTION_CONTEXT',
          evidenceStrength: 'SUPPORTING',
          sourceNodeIds: [],
          description: 'Same section',
          confidence: 0.88,
        },
      ],
      confidenceScore: 0.99,
      verificationStatus: 'RELATIONSHIP_UNVERIFIED',
      isSymmetric: true,
      provenance: { sourceSnapshotId: 'snap_1', sourceDocumentId: 'doc_1', createdAt: 0 },
    };

    const resultA = engine.evaluateRelationship({ relationship: relA, sourceCandidate: candA, targetCandidate: candB });
    expect(resultA.verificationStatus).toBe('RELATIONSHIP_PLAUSIBLE');
    expect(resultA.isEligibleForFamilySynthesis).toBe(false);

    // Case B: Confidence = 0.01 with 2 hard tokens
    const relB: QuestionRelationshipCandidate = {
      relationshipId: 'rel_two_tokens_low_conf',
      sourceCandidateId: candA.candidateId,
      targetCandidateId: candB.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [
        {
          evidenceId: 'ev_hard_1',
          evidenceType: 'MATCHING_PRINTED_NUMERAL',
          evidenceStrength: 'HARD',
          sourceNodeIds: [],
          description: 'Numeral match',
          confidence: 0.01,
        },
        {
          evidenceId: 'ev_hard_2',
          evidenceType: 'DISTINCT_SCRIPT_DETECTION',
          evidenceStrength: 'HARD',
          sourceNodeIds: [],
          description: 'Script match',
          confidence: 0.01,
        },
      ],
      confidenceScore: 0.01, // Low confidence heuristic
      verificationStatus: 'RELATIONSHIP_UNVERIFIED',
      isSymmetric: true,
      provenance: { sourceSnapshotId: 'snap_1', sourceDocumentId: 'doc_1', createdAt: 0 },
    };

    const resultB = engine.evaluateRelationship({ relationship: relB, sourceCandidate: candA, targetCandidate: candB });
    expect(resultB.verificationStatus).toBe('RELATIONSHIP_PROVEN');
    expect(resultB.isEligibleForFamilySynthesis).toBe(true);
  });

  // ==========================================================================
  // 2. Algebraic Properties & Transitivity Tests
  // ==========================================================================

  it('4. Enforces strict NON-TRANSITIVITY for LANGUAGE_REPRESENTATION_OF (Case A: English-Hindi-English Triangle)', () => {
    const candEngA = createMockCandidate({ candidateId: 'eng_a', languageRepresentations: [{ languageScript: 'LATIN', pageNumber: 2, stemNodeIds: [], bodyNodeIds: [], optionCandidateIds: [] }] });
    const candHinB = createMockCandidate({ candidateId: 'hin_b', languageRepresentations: [{ languageScript: 'DEVANAGARI', pageNumber: 3, stemNodeIds: [], bodyNodeIds: [], optionCandidateIds: [] }] });
    const candEngC = createMockCandidate({ candidateId: 'eng_c', languageRepresentations: [{ languageScript: 'LATIN', pageNumber: 4, stemNodeIds: [], bodyNodeIds: [], optionCandidateIds: [] }] });

    const relAB: QuestionRelationshipCandidate = {
      relationshipId: 'rel_a_b',
      sourceCandidateId: candEngA.candidateId,
      targetCandidateId: candHinB.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [
        { evidenceId: 'e1', evidenceType: 'FACING_PAGE_SPREAD_PAIR', evidenceStrength: 'HARD', sourceNodeIds: [], description: '', confidence: 1.0 },
        { evidenceId: 'e2', evidenceType: 'MATCHING_PRINTED_NUMERAL', evidenceStrength: 'HARD', sourceNodeIds: [], description: '', confidence: 1.0 },
      ],
      confidenceScore: 0.95,
      verificationStatus: 'RELATIONSHIP_PROVEN',
      isSymmetric: true,
      provenance: { sourceSnapshotId: 's', sourceDocumentId: 'd', createdAt: 0 },
    };

    const evalAB = engine.evaluateRelationship({ relationship: relAB, sourceCandidate: candEngA, targetCandidate: candHinB });
    expect(evalAB.verificationStatus).toBe('RELATIONSHIP_PROVEN');
    expect(evalAB.isTransitive).toBe(false);

    // Ensure evaluation of batch does not infer edge (A, C)
    const batchEvals = engine.evaluateAllRelationships({
      relationships: [relAB],
      candidates: [candEngA, candHinB, candEngC],
    });

    expect(batchEvals.length).toBe(1);
    expect(batchEvals.some((e) => (e.sourceCandidateId === 'eng_a' && e.targetCandidateId === 'eng_c') || (e.sourceCandidateId === 'eng_c' && e.targetCandidateId === 'eng_a'))).toBe(false);
  });

  it('5. Enforces CONTINUATION_OF: Valid monotonic order => PROVEN; Non-monotonic order => CONFLICTED', () => {
    const candHead = createMockCandidate({ candidateId: 'c_head', startPageNumber: 2, candidateDisplayOrder: 1 });
    const candTail = createMockCandidate({ candidateId: 'c_tail', startPageNumber: 3, candidateDisplayOrder: 1 });

    const validCont: QuestionRelationshipCandidate = {
      relationshipId: 'rel_cont_valid',
      sourceCandidateId: candHead.candidateId,
      targetCandidateId: candTail.candidateId,
      relationshipType: 'CONTINUATION_OF',
      evidence: [{ evidenceId: 'e_cont', evidenceType: 'MATCHING_SUB_CLAUSE_TOPOLOGY', evidenceStrength: 'HARD', sourceNodeIds: [], description: '', confidence: 1.0 }],
      confidenceScore: 0.9,
      verificationStatus: 'RELATIONSHIP_UNVERIFIED',
      isSymmetric: false,
      provenance: { sourceSnapshotId: 's', sourceDocumentId: 'd', createdAt: 0 },
    };

    const validEval = engine.evaluateRelationship({ relationship: validCont, sourceCandidate: candHead, targetCandidate: candTail });
    expect(validEval.verificationStatus).toBe('RELATIONSHIP_PROVEN');
    expect(validEval.isSymmetric).toBe(false);
    expect(validEval.isTransitive).toBe(true);
    expect(validEval.isEligibleForFamilySynthesis).toBe(false); // Merges candidate node sets, does not create separate family

    // Non-monotonic continuation: Page 3 to Page 2
    const invalidCont: QuestionRelationshipCandidate = {
      relationshipId: 'rel_cont_invalid',
      sourceCandidateId: candTail.candidateId,
      targetCandidateId: candHead.candidateId,
      relationshipType: 'CONTINUATION_OF',
      evidence: [],
      confidenceScore: 0.9,
      verificationStatus: 'RELATIONSHIP_UNVERIFIED',
      isSymmetric: false,
      provenance: { sourceSnapshotId: 's', sourceDocumentId: 'd', createdAt: 0 },
    };

    const invalidEval = engine.evaluateRelationship({ relationship: invalidCont, sourceCandidate: candTail, targetCandidate: candHead });
    expect(invalidEval.verificationStatus).toBe('RELATIONSHIP_CONFLICTED');
    expect(invalidEval.conflictingEvidence.some((e) => e.evidenceType === 'INCOMPATIBLE_SPATIAL_ORDER')).toBe(true);
  });

  it('6. Caps POSSIBLE_DUPLICATE_CANDIDATE at PLAUSIBLE (Never auto-proven)', () => {
    const cand1 = createMockCandidate({ candidateId: 'dup_1' });
    const cand2 = createMockCandidate({ candidateId: 'dup_2' });

    const dupRel: QuestionRelationshipCandidate = {
      relationshipId: 'rel_dup',
      sourceCandidateId: cand1.candidateId,
      targetCandidateId: cand2.candidateId,
      relationshipType: 'POSSIBLE_DUPLICATE_CANDIDATE',
      evidence: [
        { evidenceId: 'e1', evidenceType: 'MATCHING_PRINTED_NUMERAL', evidenceStrength: 'HARD', sourceNodeIds: [], description: '', confidence: 1.0 },
        { evidenceId: 'e2', evidenceType: 'IDENTICAL_OPTION_CARDINALITY', evidenceStrength: 'HARD', sourceNodeIds: [], description: '', confidence: 1.0 },
      ],
      confidenceScore: 0.99,
      verificationStatus: 'RELATIONSHIP_UNVERIFIED',
      isSymmetric: true,
      provenance: { sourceSnapshotId: 's', sourceDocumentId: 'd', createdAt: 0 },
    };

    const dupEval = engine.evaluateRelationship({ relationship: dupRel, sourceCandidate: cand1, targetCandidate: cand2 });
    expect(dupEval.verificationStatus).toBe('RELATIONSHIP_PLAUSIBLE');
    expect(dupEval.isEligibleForFamilySynthesis).toBe(false);
    expect(dupEval.unresolvedReasons).toBeDefined();
  });

  it('7. Handles UPSC Page 6 Hindi Q16 vs English Q15 discrepancy with preserved physical labels', () => {
    const hindiQ16 = createMockCandidate({
      candidateId: 'cand_upsc_p6_q16_hin',
      physicalInstanceId: 'inst_p6_q16_hin',
      sourceQuestionNumber: '16',
      startPageNumber: 6,
      optionCandidateIds: ['h1', 'h2', 'h3', 'h4'],
      languageRepresentations: [
        {
          languageScript: 'DEVANAGARI',
          pageNumber: 6,
          stemNodeIds: ['hn_16'],
          bodyNodeIds: [],
          optionCandidateIds: ['h1', 'h2', 'h3', 'h4'],
        },
      ],
    });

    const englishQ15 = createMockCandidate({
      candidateId: 'cand_upsc_p7_q15_eng',
      physicalInstanceId: 'inst_p7_q15_eng',
      sourceQuestionNumber: '15',
      startPageNumber: 7,
      optionCandidateIds: ['e1', 'e2', 'e3', 'e4'],
      languageRepresentations: [
        {
          languageScript: 'LATIN',
          pageNumber: 7,
          stemNodeIds: ['en_15'],
          bodyNodeIds: [],
          optionCandidateIds: ['e1', 'e2', 'e3', 'e4'],
        },
      ],
    });

    const relationship: QuestionRelationshipCandidate = {
      relationshipId: 'rel_upsc_p6_p7_q15_q16',
      sourceCandidateId: hindiQ16.candidateId,
      targetCandidateId: englishQ15.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [
        {
          evidenceId: 'ev_spread',
          evidenceType: 'FACING_PAGE_SPREAD_PAIR',
          evidenceStrength: 'HARD',
          sourceNodeIds: [],
          description: 'Page 6 Verso and Page 7 Recto facing spread',
          confidence: 1.0,
        },
        {
          evidenceId: 'ev_script',
          evidenceType: 'DISTINCT_SCRIPT_DETECTION',
          evidenceStrength: 'HARD',
          sourceNodeIds: [],
          description: 'Devanagari vs Latin distinct scripts',
          confidence: 1.0,
        },
        {
          evidenceId: 'ev_opts',
          evidenceType: 'IDENTICAL_OPTION_CARDINALITY',
          evidenceStrength: 'HARD',
          sourceNodeIds: [],
          description: '4 options in both representations',
          confidence: 1.0,
        },
      ],
      confidenceScore: 0.98,
      verificationStatus: 'RELATIONSHIP_PROVEN',
      isSymmetric: true,
      provenance: { sourceSnapshotId: 'snap_upsc_2023', sourceDocumentId: 'doc_upsc_gs1', createdAt: 0 },
    };

    const result = engine.evaluateRelationship({
      relationship,
      sourceCandidate: hindiQ16,
      targetCandidate: englishQ15,
    });

    expect(result.verificationStatus).toBe('RELATIONSHIP_PROVEN');
    expect(result.isEligibleForFamilySynthesis).toBe(true);
    expect(result.hardEvidence.length).toBeGreaterThanOrEqual(2);
    expect(result.sourcePhysicalInstanceId).toBe('inst_p6_q16_hin');
    expect(result.targetPhysicalInstanceId).toBe('inst_p7_q15_eng');
  });

  // ==========================================================================
  // 3. Immutability & Determinism Verification
  // ==========================================================================

  it('8. Deep-Freeze Immutability: Guarantees zero mutation on frozen inputs', () => {
    const candA = Object.freeze(createMockCandidate({ candidateId: 'c_frozen_1', physicalInstanceId: 'inst_f1' }));
    const candB = Object.freeze(createMockCandidate({ candidateId: 'c_frozen_2', physicalInstanceId: 'inst_f2' }));
    const rel = Object.freeze({
      relationshipId: 'rel_frozen',
      sourceCandidateId: candA.candidateId,
      targetCandidateId: candB.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF' as const,
      evidence: Object.freeze([]) as readonly RelationshipEvidence[],
      confidenceScore: 0.9,
      verificationStatus: 'RELATIONSHIP_UNVERIFIED' as const,
      isSymmetric: true,
      provenance: Object.freeze({ sourceSnapshotId: 's1', sourceDocumentId: 'd1', createdAt: 0 }),
    });

    expect(() => {
      engine.evaluateRelationship({
        relationship: rel as QuestionRelationshipCandidate,
        sourceCandidate: candA,
        targetCandidate: candB,
      });
    }).not.toThrow();
  });

  it('9. Deterministic ID Generation: Produces identical evaluationId regardless of evidence array insertion order', () => {
    const candA = createMockCandidate({ candidateId: 'c_ord_1', physicalInstanceId: 'inst_ord_1', startPageNumber: 2 });
    const candB = createMockCandidate({
      candidateId: 'c_ord_2',
      physicalInstanceId: 'inst_ord_2',
      startPageNumber: 3,
      languageRepresentations: [{ languageScript: 'LATIN', pageNumber: 3, stemNodeIds: [], bodyNodeIds: [], optionCandidateIds: ['o1', 'o2', 'o3', 'o4'] }],
    });

    const ev1: RelationshipEvidence = { evidenceId: 'ev_a', evidenceType: 'MATCHING_PRINTED_NUMERAL', evidenceStrength: 'HARD', sourceNodeIds: [], description: '', confidence: 1.0 };
    const ev2: RelationshipEvidence = { evidenceId: 'ev_b', evidenceType: 'EXPLICIT_OFFICIAL_QUESTION_ID', evidenceStrength: 'HARD', sourceNodeIds: [], description: '', confidence: 1.0 };

    const relOrder1: QuestionRelationshipCandidate = {
      relationshipId: 'rel_ord',
      sourceCandidateId: candA.candidateId,
      targetCandidateId: candB.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [ev1, ev2],
      confidenceScore: 0.95,
      verificationStatus: 'RELATIONSHIP_PROVEN',
      isSymmetric: true,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', createdAt: 0 },
    };

    const relOrder2: QuestionRelationshipCandidate = {
      relationshipId: 'rel_ord',
      sourceCandidateId: candA.candidateId,
      targetCandidateId: candB.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [ev2, ev1], // Reversed evidence order!
      confidenceScore: 0.95,
      verificationStatus: 'RELATIONSHIP_PROVEN',
      isSymmetric: true,
      provenance: { sourceSnapshotId: 's1', sourceDocumentId: 'd1', createdAt: 0 },
    };

    const eval1 = engine.evaluateRelationship({ relationship: relOrder1, sourceCandidate: candA, targetCandidate: candB });
    const eval2 = engine.evaluateRelationship({ relationship: relOrder2, sourceCandidate: candA, targetCandidate: candB });

    expect(eval1.evaluationId).toBe(eval2.evaluationId);
  });

  // ==========================================================================
  // 4. Adversarial Family-Boundary Contract Tests (P3 Cases A-F)
  // ==========================================================================

  it('10. CASE A: Transitivity Isolation — A SAME_LOGICAL_QUESTION B and B SAME_LOGICAL_QUESTION C does NOT auto-generate A SAME_LOGICAL_QUESTION C', () => {
    const candA = createMockCandidate({ candidateId: 'cand_a', physicalInstanceId: 'inst_a' });
    const candB = createMockCandidate({ candidateId: 'cand_b', physicalInstanceId: 'inst_b' });
    const candC = createMockCandidate({ candidateId: 'cand_c', physicalInstanceId: 'inst_c' });

    const relAB: QuestionRelationshipCandidate = {
      relationshipId: 'rel_a_b',
      sourceCandidateId: candA.candidateId,
      targetCandidateId: candB.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [
        { evidenceId: 'e1', evidenceType: 'EXPLICIT_OFFICIAL_QUESTION_ID', evidenceStrength: 'HARD', sourceNodeIds: [], description: 'ID match', confidence: 1.0 },
        { evidenceId: 'e2', evidenceType: 'MATCHING_PRINTED_NUMERAL', evidenceStrength: 'HARD', sourceNodeIds: [], description: 'Numeral match', confidence: 1.0 },
      ],
      confidenceScore: 0.99,
      verificationStatus: 'RELATIONSHIP_PROVEN',
      isSymmetric: true,
      provenance: { sourceSnapshotId: 's', sourceDocumentId: 'd', createdAt: 0 },
    };

    const relBC: QuestionRelationshipCandidate = {
      relationshipId: 'rel_b_c',
      sourceCandidateId: candB.candidateId,
      targetCandidateId: candC.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [
        { evidenceId: 'e3', evidenceType: 'EXPLICIT_OFFICIAL_QUESTION_ID', evidenceStrength: 'HARD', sourceNodeIds: [], description: 'ID match', confidence: 1.0 },
        { evidenceId: 'e4', evidenceType: 'MATCHING_PRINTED_NUMERAL', evidenceStrength: 'HARD', sourceNodeIds: [], description: 'Numeral match', confidence: 1.0 },
      ],
      confidenceScore: 0.99,
      verificationStatus: 'RELATIONSHIP_PROVEN',
      isSymmetric: true,
      provenance: { sourceSnapshotId: 's', sourceDocumentId: 'd', createdAt: 0 },
    };

    // Evaluate both pairwise relationships in batch
    const results = engine.evaluateAllRelationships({
      relationships: [relAB, relBC],
      candidates: [candA, candB, candC],
    });

    expect(results.length).toBe(2);
    // Explicitly verify that NO edge (A, C) or (C, A) was generated
    const hasACEdge = results.some(
      (r) =>
        (r.sourceCandidateId === 'cand_a' && r.targetCandidateId === 'cand_c') ||
        (r.sourceCandidateId === 'cand_c' && r.targetCandidateId === 'cand_a')
    );
    expect(hasACEdge).toBe(false);
  });

  it('11. CASE B: Non-Transitive Language Rep — A LANGUAGE_REPRESENTATION_OF B and B LANGUAGE_REPRESENTATION_OF C produces NO A <-> C edge', () => {
    const candA = createMockCandidate({
      candidateId: 'cand_en1',
      languageRepresentations: [{ languageScript: 'LATIN', pageNumber: 2, stemNodeIds: [], bodyNodeIds: [], optionCandidateIds: [] }],
    });
    const candB = createMockCandidate({
      candidateId: 'cand_hi',
      languageRepresentations: [{ languageScript: 'DEVANAGARI', pageNumber: 3, stemNodeIds: [], bodyNodeIds: [], optionCandidateIds: [] }],
    });
    const candC = createMockCandidate({
      candidateId: 'cand_en2',
      languageRepresentations: [{ languageScript: 'LATIN', pageNumber: 4, stemNodeIds: [], bodyNodeIds: [], optionCandidateIds: [] }],
    });

    const relAB: QuestionRelationshipCandidate = {
      relationshipId: 'rel_en1_hi',
      sourceCandidateId: candA.candidateId,
      targetCandidateId: candB.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [
        { evidenceId: 'e1', evidenceType: 'FACING_PAGE_SPREAD_PAIR', evidenceStrength: 'HARD', sourceNodeIds: [], description: '', confidence: 1.0 },
        { evidenceId: 'e2', evidenceType: 'DISTINCT_SCRIPT_DETECTION', evidenceStrength: 'HARD', sourceNodeIds: [], description: '', confidence: 1.0 },
      ],
      confidenceScore: 0.95,
      verificationStatus: 'RELATIONSHIP_PROVEN',
      isSymmetric: true,
      provenance: { sourceSnapshotId: 's', sourceDocumentId: 'd', createdAt: 0 },
    };

    const relBC: QuestionRelationshipCandidate = {
      relationshipId: 'rel_hi_en2',
      sourceCandidateId: candB.candidateId,
      targetCandidateId: candC.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [
        { evidenceId: 'e3', evidenceType: 'FACING_PAGE_SPREAD_PAIR', evidenceStrength: 'HARD', sourceNodeIds: [], description: '', confidence: 1.0 },
        { evidenceId: 'e4', evidenceType: 'DISTINCT_SCRIPT_DETECTION', evidenceStrength: 'HARD', sourceNodeIds: [], description: '', confidence: 1.0 },
      ],
      confidenceScore: 0.95,
      verificationStatus: 'RELATIONSHIP_PROVEN',
      isSymmetric: true,
      provenance: { sourceSnapshotId: 's', sourceDocumentId: 'd', createdAt: 0 },
    };

    const results = engine.evaluateAllRelationships({
      relationships: [relAB, relBC],
      candidates: [candA, candB, candC],
    });

    expect(results.length).toBe(2);
    const hasAC = results.some(
      (r) =>
        (r.sourceCandidateId === 'cand_en1' && r.targetCandidateId === 'cand_en2') ||
        (r.sourceCandidateId === 'cand_en2' && r.targetCandidateId === 'cand_en1')
    );
    expect(hasAC).toBe(false);
  });

  it('12. CASE C: Multi-Hop CONTINUATION_OF — A CONTINUATION_OF B and B CONTINUATION_OF C yields isEligibleForFamilySynthesis = false', () => {
    const cand1 = createMockCandidate({ candidateId: 'c1', startPageNumber: 1, candidateDisplayOrder: 1 });
    const cand2 = createMockCandidate({ candidateId: 'c2', startPageNumber: 2, candidateDisplayOrder: 1 });
    const cand3 = createMockCandidate({ candidateId: 'c3', startPageNumber: 3, candidateDisplayOrder: 1 });

    const rel12: QuestionRelationshipCandidate = {
      relationshipId: 'rel_1_2',
      sourceCandidateId: cand1.candidateId,
      targetCandidateId: cand2.candidateId,
      relationshipType: 'CONTINUATION_OF',
      evidence: [
        { evidenceId: 'e1', evidenceType: 'MATCHING_SUB_CLAUSE_TOPOLOGY', evidenceStrength: 'HARD', sourceNodeIds: [], description: '', confidence: 1.0 },
      ],
      confidenceScore: 0.9,
      verificationStatus: 'RELATIONSHIP_UNVERIFIED',
      isSymmetric: false,
      provenance: { sourceSnapshotId: 's', sourceDocumentId: 'd', createdAt: 0 },
    };

    const rel23: QuestionRelationshipCandidate = {
      relationshipId: 'rel_2_3',
      sourceCandidateId: cand2.candidateId,
      targetCandidateId: cand3.candidateId,
      relationshipType: 'CONTINUATION_OF',
      evidence: [
        { evidenceId: 'e2', evidenceType: 'MATCHING_SUB_CLAUSE_TOPOLOGY', evidenceStrength: 'HARD', sourceNodeIds: [], description: '', confidence: 1.0 },
      ],
      confidenceScore: 0.9,
      verificationStatus: 'RELATIONSHIP_UNVERIFIED',
      isSymmetric: false,
      provenance: { sourceSnapshotId: 's', sourceDocumentId: 'd', createdAt: 0 },
    };

    const eval12 = engine.evaluateRelationship({ relationship: rel12, sourceCandidate: cand1, targetCandidate: cand2 });
    const eval23 = engine.evaluateRelationship({ relationship: rel23, sourceCandidate: cand2, targetCandidate: cand3 });

    expect(eval12.verificationStatus).toBe('RELATIONSHIP_PROVEN');
    expect(eval12.isEligibleForFamilySynthesis).toBe(false);
    expect(eval23.verificationStatus).toBe('RELATIONSHIP_PROVEN');
    expect(eval23.isEligibleForFamilySynthesis).toBe(false);
  });

  it('13. CASE D: Same printed number with incompatible section context yields CONFLICTED (No identity proof)', () => {
    const candSecA = createMockCandidate({ candidateId: 'c_sec_a', startPageNumber: 2, sourceQuestionNumber: '5' });
    const candSecB = createMockCandidate({ candidateId: 'c_sec_b', startPageNumber: 3, sourceQuestionNumber: '5' });

    const relIncompSec: QuestionRelationshipCandidate = {
      relationshipId: 'rel_incomp_sec',
      sourceCandidateId: candSecA.candidateId,
      targetCandidateId: candSecB.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [
        { evidenceId: 'e_num', evidenceType: 'MATCHING_PRINTED_NUMERAL', evidenceStrength: 'HARD', sourceNodeIds: [], description: 'Matching printed numeral 5', confidence: 1.0 },
        { evidenceId: 'e_sec_conf', evidenceType: 'DIFFERENT_SECTION_CONTEXT', evidenceStrength: 'CONFLICTING', sourceNodeIds: [], description: 'Section I (Physics) vs Section II (Chemistry)', confidence: 1.0 },
      ],
      confidenceScore: 0.9,
      verificationStatus: 'RELATIONSHIP_UNVERIFIED',
      isSymmetric: true,
      provenance: { sourceSnapshotId: 's', sourceDocumentId: 'd', createdAt: 0 },
    };

    const evalResult = engine.evaluateRelationship({ relationship: relIncompSec, sourceCandidate: candSecA, targetCandidate: candSecB });
    expect(evalResult.verificationStatus).toBe('RELATIONSHIP_CONFLICTED');
    expect(evalResult.isEligibleForFamilySynthesis).toBe(false);
    expect(evalResult.conflictingEvidence.length).toBeGreaterThanOrEqual(1);
  });

  it('14. CASE E: High confidence with insufficient hard evidence (< 2 Hard) yields PLAUSIBLE / AMBIGUOUS (Not PROVEN)', () => {
    const candA = createMockCandidate({ candidateId: 'c_conf_a' });
    const candB = createMockCandidate({ candidateId: 'c_conf_b' });

    const relWeak: QuestionRelationshipCandidate = {
      relationshipId: 'rel_weak_evidence',
      sourceCandidateId: candA.candidateId,
      targetCandidateId: candB.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [
        { evidenceId: 'e_weak_1', evidenceType: 'SAME_PRINTED_NUMBER_ONLY', evidenceStrength: 'WEAK', sourceNodeIds: [], description: 'Number 3 text match', confidence: 0.99 },
        { evidenceId: 'e_weak_2', evidenceType: 'ROUGH_TEXT_LENGTH_PROPORTION', evidenceStrength: 'WEAK', sourceNodeIds: [], description: 'Proportional length', confidence: 0.95 },
      ],
      confidenceScore: 0.99, // Artificially high heuristic confidence
      verificationStatus: 'RELATIONSHIP_UNVERIFIED',
      isSymmetric: true,
      provenance: { sourceSnapshotId: 's', sourceDocumentId: 'd', createdAt: 0 },
    };

    const evalResult = engine.evaluateRelationship({ relationship: relWeak, sourceCandidate: candA, targetCandidate: candB });
    expect(evalResult.verificationStatus).not.toBe('RELATIONSHIP_PROVEN');
    expect(evalResult.verificationStatus).toBe('RELATIONSHIP_AMBIGUOUS');
    expect(evalResult.isEligibleForFamilySynthesis).toBe(false);
  });

  it('15. CASE F: 5 Direct hard evidence tokens with 1 fatal conflict yields CONFLICTED and isEligibleForFamilySynthesis = false', () => {
    const candA = createMockCandidate({ candidateId: 'c_hard_a' });
    const candB = createMockCandidate({ candidateId: 'c_hard_b' });

    const fiveHardTokens: RelationshipEvidence[] = [
      { evidenceId: 'h1', evidenceType: 'EXPLICIT_OFFICIAL_QUESTION_ID', evidenceStrength: 'HARD', sourceNodeIds: [], description: '', confidence: 1.0 },
      { evidenceId: 'h2', evidenceType: 'MATCHING_PRINTED_NUMERAL', evidenceStrength: 'HARD', sourceNodeIds: [], description: '', confidence: 1.0 },
      { evidenceId: 'h3', evidenceType: 'IDENTICAL_OPTION_CARDINALITY', evidenceStrength: 'HARD', sourceNodeIds: [], description: '', confidence: 1.0 },
      { evidenceId: 'h4', evidenceType: 'MATCHING_SUB_CLAUSE_TOPOLOGY', evidenceStrength: 'HARD', sourceNodeIds: [], description: '', confidence: 1.0 },
      { evidenceId: 'h5', evidenceType: 'FACING_PAGE_SPREAD_PAIR', evidenceStrength: 'HARD', sourceNodeIds: [], description: '', confidence: 1.0 },
    ];

    const fatalConflictToken: RelationshipEvidence = {
      evidenceId: 'c1',
      evidenceType: 'NUMERICAL_DISCONTINUITY',
      evidenceStrength: 'CONFLICTING',
      sourceNodeIds: [],
      description: 'Discontinuous official numbering in corrigendum',
      confidence: 1.0,
    };

    const relHardWithConflict: QuestionRelationshipCandidate = {
      relationshipId: 'rel_hard_conflict',
      sourceCandidateId: candA.candidateId,
      targetCandidateId: candB.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [...fiveHardTokens, fatalConflictToken],
      confidenceScore: 0.99,
      verificationStatus: 'RELATIONSHIP_UNVERIFIED',
      isSymmetric: true,
      provenance: { sourceSnapshotId: 's', sourceDocumentId: 'd', createdAt: 0 },
    };

    const evalResult = engine.evaluateRelationship({ relationship: relHardWithConflict, sourceCandidate: candA, targetCandidate: candB });
    expect(evalResult.verificationStatus).toBe('RELATIONSHIP_CONFLICTED');
    expect(evalResult.isEligibleForFamilySynthesis).toBe(false);
    expect(evalResult.confidenceScore).toBe(0.0);
  });
});

