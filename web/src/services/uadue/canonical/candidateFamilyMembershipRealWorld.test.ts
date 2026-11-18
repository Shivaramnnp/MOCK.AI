/**
 * UADUE Phase 2D-2 — Candidate Family Membership Real-World Validation Suite
 * Document Version: 3.0.0-TOPOLOGY-HARDENED
 *
 * Validates real-world candidate family membership evaluation against authentic exam archetypes:
 * 1. UPSC CSE GS1 bilingual candidate pair (Hindi Q1 Page 2 <-> English Q1 Page 3) => ACCEPTED.
 * 2. UPSC CSE GS1 Page 6/7 numbering discrepancy (Hindi Q16 Page 6 <-> English Q15 Page 7) => ACCEPTED with preserved physical labels.
 * 3. GATE CS 2024 multi-page continuation (Q12 Page 4 -> Q12 Page 5) => REJECTED for family membership.
 * 4. JEE Advanced 2023 matrix continuation (Q5 Page 3 -> Q5 Page 4) => REJECTED for family membership.
 * 5. UPSC misaligned question pair (Hindi Q7 Page 6 <-> English Q8 Page 7) with conflicting tokens => REJECTED.
 */

import { describe, it, expect } from 'vitest';
import {
  QuestionCandidate,
  QuestionRelationshipCandidate,
} from '../contracts/questionGraph';
import { RelationshipEvaluationEngine } from './relationshipEvaluationEngine';
import { CandidateFamilyMembershipEvaluator } from './candidateFamilyMembershipEvaluator';

describe('UADUE Phase 2D-2 — Real-World Candidate Family Membership Validation', () => {
  const relEngine = new RelationshipEvaluationEngine();
  const membershipEvaluator = new CandidateFamilyMembershipEvaluator();

  const createMockCandidate = (overrides: Partial<QuestionCandidate>): QuestionCandidate => ({
    candidateId: 'cand_rw_1',
    physicalInstanceId: 'inst_rw_1',
    candidateDisplayOrder: 1,
    sourceOrder: 1,
    startPageNumber: 2,
    endPageNumber: 2,
    isMultiPage: false,
    identityCandidate: {
      physicalInstanceId: 'inst_rw_1',
      numberType: 'QUESTION_NUMBER',
      confidence: 1.0,
      supportingEvidenceIds: [],
    },
    includedPhysicalNodeIds: ['node_1'],
    stemNodeIds: ['node_1'],
    bodyNodeIds: [],
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
        bodyNodeIds: [],
        optionCandidateIds: ['opt_1', 'opt_2', 'opt_3', 'opt_4'],
      },
    ],
    ...overrides,
  });

  it('1. UPSC GS1 Bilingual Pair: Validates and accepts membership for proven English-Hindi facing pair', () => {
    const hindiQ1 = createMockCandidate({
      candidateId: 'cand_upsc_p2_q1_hin',
      physicalInstanceId: 'inst_p2_q1_hin',
      sourceQuestionNumber: '1',
      startPageNumber: 2,
      optionCandidateIds: ['h1', 'h2', 'h3', 'h4'],
      languageRepresentations: [
        { languageScript: 'DEVANAGARI', pageNumber: 2, stemNodeIds: ['hn_1'], bodyNodeIds: [], optionCandidateIds: ['h1', 'h2', 'h3', 'h4'] },
      ],
    });

    const englishQ1 = createMockCandidate({
      candidateId: 'cand_upsc_p3_q1_eng',
      physicalInstanceId: 'inst_p3_q1_eng',
      sourceQuestionNumber: '1',
      startPageNumber: 3,
      optionCandidateIds: ['e1', 'e2', 'e3', 'e4'],
      languageRepresentations: [
        { languageScript: 'LATIN', pageNumber: 3, stemNodeIds: ['en_1'], bodyNodeIds: [], optionCandidateIds: ['e1', 'e2', 'e3', 'e4'] },
      ],
    });

    const rel: QuestionRelationshipCandidate = {
      relationshipId: 'rel_upsc_q1',
      sourceCandidateId: hindiQ1.candidateId,
      targetCandidateId: englishQ1.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [
        { evidenceId: 'e_spread', evidenceType: 'FACING_PAGE_SPREAD_PAIR', evidenceStrength: 'HARD', sourceNodeIds: [], description: 'Facing spread', confidence: 1.0 },
        { evidenceId: 'e_script', evidenceType: 'DISTINCT_SCRIPT_DETECTION', evidenceStrength: 'HARD', sourceNodeIds: [], description: 'Distinct script', confidence: 1.0 },
      ],
      confidenceScore: 0.98,
      verificationStatus: 'RELATIONSHIP_PROVEN',
      isSymmetric: true,
      provenance: { sourceSnapshotId: 'snap_upsc', sourceDocumentId: 'doc_upsc', createdAt: 0 },
    };

    const evalResult = relEngine.evaluateRelationship({
      relationship: rel,
      sourceCandidate: hindiQ1,
      targetCandidate: englishQ1,
    });

    const membershipResult = membershipEvaluator.evaluateMembership({
      candidate: hindiQ1,
      familyTargetCandidate: englishQ1,
      directRelationshipEvaluation: evalResult,
    });

    expect(membershipResult.isAccepted).toBe(true);
    expect(membershipResult.membership).toBeDefined();
    expect(membershipResult.membership?.candidatePhysicalInstanceId).toBe('inst_p2_q1_hin');
    expect(membershipResult.membership?.familyCandidateId).toBe('cand_upsc_p3_q1_eng');
    expect(membershipResult.membership?.directRelationshipEvaluationIds).toEqual([evalResult.evaluationId]);
  });

  it('2. UPSC GS1 Discrepancy Case: Preserves exact source numbering for Hindi Q16 and English Q15', () => {
    const hindiQ16 = createMockCandidate({
      candidateId: 'cand_upsc_p6_q16_hin',
      physicalInstanceId: 'inst_p6_q16_hin',
      sourceQuestionNumber: '16',
      startPageNumber: 6,
      optionCandidateIds: ['h1', 'h2', 'h3', 'h4'],
      languageRepresentations: [
        { languageScript: 'DEVANAGARI', pageNumber: 6, stemNodeIds: ['hn_16'], bodyNodeIds: [], optionCandidateIds: ['h1', 'h2', 'h3', 'h4'] },
      ],
    });

    const englishQ15 = createMockCandidate({
      candidateId: 'cand_upsc_p7_q15_eng',
      physicalInstanceId: 'inst_p7_q15_eng',
      sourceQuestionNumber: '15',
      startPageNumber: 7,
      optionCandidateIds: ['e1', 'e2', 'e3', 'e4'],
      languageRepresentations: [
        { languageScript: 'LATIN', pageNumber: 7, stemNodeIds: ['en_15'], bodyNodeIds: [], optionCandidateIds: ['e1', 'e2', 'e3', 'e4'] },
      ],
    });

    const rel: QuestionRelationshipCandidate = {
      relationshipId: 'rel_upsc_p6_p7_q15_q16',
      sourceCandidateId: hindiQ16.candidateId,
      targetCandidateId: englishQ15.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [
        { evidenceId: 'ev_spread', evidenceType: 'FACING_PAGE_SPREAD_PAIR', evidenceStrength: 'HARD', sourceNodeIds: [], description: 'Facing spread', confidence: 1.0 },
        { evidenceId: 'ev_script', evidenceType: 'DISTINCT_SCRIPT_DETECTION', evidenceStrength: 'HARD', sourceNodeIds: [], description: 'Distinct script', confidence: 1.0 },
        { evidenceId: 'ev_opts', evidenceType: 'IDENTICAL_OPTION_CARDINALITY', evidenceStrength: 'HARD', sourceNodeIds: [], description: '4 options', confidence: 1.0 },
      ],
      confidenceScore: 0.98,
      verificationStatus: 'RELATIONSHIP_PROVEN',
      isSymmetric: true,
      provenance: { sourceSnapshotId: 'snap_upsc', sourceDocumentId: 'doc_upsc', createdAt: 0 },
    };

    const evalResult = relEngine.evaluateRelationship({
      relationship: rel,
      sourceCandidate: hindiQ16,
      targetCandidate: englishQ15,
    });

    const membershipResult = membershipEvaluator.evaluateMembership({
      candidate: hindiQ16,
      familyTargetCandidate: englishQ15,
      directRelationshipEvaluation: evalResult,
    });

    expect(membershipResult.isAccepted).toBe(true);
    expect(membershipResult.membership?.candidatePhysicalInstanceId).toBe('inst_p6_q16_hin');
    expect(membershipResult.membership?.familyCandidateId).toBe('cand_upsc_p7_q15_eng');
    expect(hindiQ16.sourceQuestionNumber).toBe('16');
    expect(englishQ15.sourceQuestionNumber).toBe('15');
  });

  it('3. GATE CS 2024 Multi-Page Continuation: Rejects logical family membership for continuation relation', () => {
    const gateStemP4 = createMockCandidate({
      candidateId: 'cand_gate_p4_q12',
      physicalInstanceId: 'inst_gate_p4_q12',
      startPageNumber: 4,
      candidateDisplayOrder: 1,
    });

    const gateOptionsP5 = createMockCandidate({
      candidateId: 'cand_gate_p5_q12_tail',
      physicalInstanceId: 'inst_gate_p5_q12_tail',
      startPageNumber: 5,
      candidateDisplayOrder: 1,
    });

    const relCont: QuestionRelationshipCandidate = {
      relationshipId: 'rel_gate_cont',
      sourceCandidateId: gateStemP4.candidateId,
      targetCandidateId: gateOptionsP5.candidateId,
      relationshipType: 'CONTINUATION_OF',
      evidence: [
        { evidenceId: 'e_cont', evidenceType: 'MATCHING_SUB_CLAUSE_TOPOLOGY', evidenceStrength: 'HARD', sourceNodeIds: [], description: 'Monotonic continuation', confidence: 1.0 },
      ],
      confidenceScore: 0.9,
      verificationStatus: 'RELATIONSHIP_UNVERIFIED',
      isSymmetric: false,
      provenance: { sourceSnapshotId: 'snap_gate', sourceDocumentId: 'doc_gate', createdAt: 0 },
    };

    const evalResult = relEngine.evaluateRelationship({
      relationship: relCont,
      sourceCandidate: gateStemP4,
      targetCandidate: gateOptionsP5,
    });

    const membershipResult = membershipEvaluator.evaluateMembership({
      candidate: gateStemP4,
      familyTargetCandidate: gateOptionsP5,
      directRelationshipEvaluation: evalResult,
    });

    expect(membershipResult.isAccepted).toBe(false);
    expect(membershipResult.rejectionReasons.some((r) => r.includes('not eligible for family membership'))).toBe(true);
  });

  it('4. JEE Advanced 2023 Matrix Continuation: Rejects logical family membership for continuation relation', () => {
    const jeeStemP3 = createMockCandidate({
      candidateId: 'cand_jee_p3_q5',
      physicalInstanceId: 'inst_jee_p3_q5',
      startPageNumber: 3,
      candidateDisplayOrder: 2,
    });

    const jeeTableP4 = createMockCandidate({
      candidateId: 'cand_jee_p4_q5_tail',
      physicalInstanceId: 'inst_jee_p4_q5_tail',
      startPageNumber: 4,
      candidateDisplayOrder: 1,
    });

    const relCont: QuestionRelationshipCandidate = {
      relationshipId: 'rel_jee_cont',
      sourceCandidateId: jeeStemP3.candidateId,
      targetCandidateId: jeeTableP4.candidateId,
      relationshipType: 'CONTINUATION_OF',
      evidence: [
        { evidenceId: 'e_cont', evidenceType: 'MATCHING_SUB_CLAUSE_TOPOLOGY', evidenceStrength: 'HARD', sourceNodeIds: [], description: 'Monotonic continuation', confidence: 1.0 },
      ],
      confidenceScore: 0.9,
      verificationStatus: 'RELATIONSHIP_UNVERIFIED',
      isSymmetric: false,
      provenance: { sourceSnapshotId: 'snap_jee', sourceDocumentId: 'doc_jee', createdAt: 0 },
    };

    const evalResult = relEngine.evaluateRelationship({
      relationship: relCont,
      sourceCandidate: jeeStemP3,
      targetCandidate: jeeTableP4,
    });

    const membershipResult = membershipEvaluator.evaluateMembership({
      candidate: jeeStemP3,
      familyTargetCandidate: jeeTableP4,
      directRelationshipEvaluation: evalResult,
    });

    expect(membershipResult.isAccepted).toBe(false);
    expect(membershipResult.rejectionReasons.some((r) => r.includes('not eligible for family membership'))).toBe(true);
  });

  it('5. Conflicted Relationship Rejection: Rejects membership for misaligned candidate pair with fatal conflicts', () => {
    const hindiQ7 = createMockCandidate({
      candidateId: 'cand_upsc_p6_q7_hin',
      physicalInstanceId: 'inst_p6_q7_hin',
      sourceQuestionNumber: '7',
      startPageNumber: 6,
    });

    const englishQ8 = createMockCandidate({
      candidateId: 'cand_upsc_p7_q8_eng',
      physicalInstanceId: 'inst_p7_q8_eng',
      sourceQuestionNumber: '8',
      startPageNumber: 7,
    });

    const relConflict: QuestionRelationshipCandidate = {
      relationshipId: 'rel_upsc_conflict',
      sourceCandidateId: hindiQ7.candidateId,
      targetCandidateId: englishQ8.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [
        { evidenceId: 'e_conf', evidenceType: 'NUMERICAL_DISCONTINUITY', evidenceStrength: 'CONFLICTING', sourceNodeIds: [], description: 'Discontinuous numbering', confidence: 1.0 },
      ],
      confidenceScore: 0.0,
      verificationStatus: 'RELATIONSHIP_UNVERIFIED',
      isSymmetric: true,
      provenance: { sourceSnapshotId: 'snap_upsc', sourceDocumentId: 'doc_upsc', createdAt: 0 },
    };

    const evalResult = relEngine.evaluateRelationship({
      relationship: relConflict,
      sourceCandidate: hindiQ7,
      targetCandidate: englishQ8,
    });

    const membershipResult = membershipEvaluator.evaluateMembership({
      candidate: hindiQ7,
      familyTargetCandidate: englishQ8,
      directRelationshipEvaluation: evalResult,
    });

    expect(membershipResult.isAccepted).toBe(false);
    expect(membershipResult.rejectionReasons.some((r) => r.includes('is not RELATIONSHIP_PROVEN'))).toBe(true);
  });
});
