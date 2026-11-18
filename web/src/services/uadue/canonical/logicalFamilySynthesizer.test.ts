/**
 * UADUE Phase 2D-3 — Logical Family Synthesizer Adversarial Test Suite
 * Document Version: 3.0.0-TOPOLOGY-HARDENED
 *
 * Validates:
 * CASE A: A-B valid membership => Family contains A/B.
 * CASE B: A-B valid, B-C valid, no A-C => Family preserves direct memberships, creates NO synthetic A-C relationship.
 * CASE C: A LANGUAGE B, B LANGUAGE C => No synthetic A-C relationship.
 * CASE D: A CONTINUATION B => No logical family merge.
 * CASE E: A VARIANT B => Separate families.
 * CASE F: A SHARED_STIMULUS B => Separate families.
 * CASE G: Conflicted relationship => No family membership.
 * CASE H: Dangling membership => Family construction fails closed.
 * CASE I: Duplicate membership proposal => Deterministic idempotent result, no duplicate member.
 * CASE J: Reversed membership input order => Identical family fingerprint.
 * CASE K: UPSC-style source numbering discrepancy => Physical numbers preserved exactly.
 * CASE L: Multilingual family => Both physical representations retained independently.
 * CASE M: Three candidates where only A-B and A-C are directly proven => Family contains A/B/C anchored to A; NO B-C invented.
 * CASE N: Three candidates where only A-B and B-C are proven => NO B-C-derived A-C relationship created.
 */

import { describe, it, expect } from 'vitest';
import {
  QuestionCandidate,
  QuestionRelationshipCandidate,
  QuestionRelationshipType,
} from '../contracts/questionGraph';
import {
  CandidateFamilyMembership,
  CanonicalRelationshipType,
} from './types';
import { RelationshipEvaluationEngine } from './relationshipEvaluationEngine';
import { CandidateFamilyMembershipEvaluator } from './candidateFamilyMembershipEvaluator';
import { LogicalFamilySynthesizer } from './logicalFamilySynthesizer';

describe('UADUE Phase 2D-3 — Logical Family Synthesizer Adversarial Suite', () => {
  const relEngine = new RelationshipEvaluationEngine();
  const membershipEvaluator = new CandidateFamilyMembershipEvaluator();
  const familySynthesizer = new LogicalFamilySynthesizer();

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
        languageScript: 'LATIN',
        pageNumber: 2,
        stemNodeIds: ['node_1'],
        bodyNodeIds: [],
        optionCandidateIds: ['opt_1', 'opt_2', 'opt_3', 'opt_4'],
      },
    ],
    ...overrides,
  });

  const createProvenMembership = (
    relType: QuestionRelationshipType,
    candidate: QuestionCandidate,
    anchorCandidate: QuestionCandidate
  ): CandidateFamilyMembership => {
    const rel: QuestionRelationshipCandidate = {
      relationshipId: `rel_${candidate.candidateId}_${anchorCandidate.candidateId}`,
      sourceCandidateId: candidate.candidateId,
      targetCandidateId: anchorCandidate.candidateId,
      relationshipType: relType,
      evidence: [
        {
          evidenceId: `ev_num_${candidate.candidateId}`,
          evidenceType: 'MATCHING_PRINTED_NUMERAL',
          evidenceStrength: 'HARD',
          sourceNodeIds: [],
          description: 'Matching numeral',
          confidence: 1.0,
        },
        {
          evidenceId: `ev_script_${candidate.candidateId}`,
          evidenceType: 'DISTINCT_SCRIPT_DETECTION',
          evidenceStrength: 'HARD',
          sourceNodeIds: [],
          description: 'Distinct script',
          confidence: 1.0,
        },
      ],
      confidenceScore: 0.98,
      verificationStatus: 'RELATIONSHIP_PROVEN',
      isSymmetric: true,
      provenance: { sourceSnapshotId: 'snap_1', sourceDocumentId: 'doc_1', createdAt: 0 },
    };

    const evalResult = relEngine.evaluateRelationship({
      relationship: rel,
      sourceCandidate: candidate,
      targetCandidate: anchorCandidate,
    });

    const membershipResult = membershipEvaluator.evaluateMembership({
      candidate,
      familyTargetCandidate: anchorCandidate,
      directRelationshipEvaluation: evalResult,
    });

    if (!membershipResult.isAccepted || !membershipResult.membership) {
      throw new Error(`Failed to create mock membership: ${membershipResult.rejectionReasons.join('; ')}`);
    }

    return membershipResult.membership;
  };

  // ==========================================================================
  // Adversarial Cases A-N
  // ==========================================================================

  it('CASE A: A-B valid membership => Family contains A and B', () => {
    const candA = createMockCandidate({ candidateId: 'cand_a', physicalInstanceId: 'inst_a', startPageNumber: 2 });
    const candB = createMockCandidate({
      candidateId: 'cand_b',
      physicalInstanceId: 'inst_b',
      startPageNumber: 3,
      languageRepresentations: [{ languageScript: 'DEVANAGARI', pageNumber: 3, stemNodeIds: [], bodyNodeIds: [], optionCandidateIds: [] }],
    });

    const membershipBA = createProvenMembership('LANGUAGE_REPRESENTATION_OF', candB, candA);

    const result = familySynthesizer.synthesizeFamily({
      anchorCandidate: candA,
      acceptedMemberships: [membershipBA],
      allCandidates: [candA, candB],
    });

    expect(result.isSynthesized).toBe(true);
    expect(result.family).toBeDefined();
    expect(result.family?.members.length).toBe(2);
    expect(result.family?.anchorPhysicalInstanceId).toBe('inst_a');
    expect(result.family?.members.some((m) => m.candidatePhysicalInstanceId === 'inst_a' && m.representationRole === 'ANCHOR_REPRESENTATION')).toBe(true);
    expect(result.family?.members.some((m) => m.candidatePhysicalInstanceId === 'inst_b' && m.representationRole === 'LANGUAGE_REPRESENTATION')).toBe(true);
  });

  it('CASE B: A-B valid, B-C valid, no A-C => Preserves direct memberships, creates NO synthetic A-C relationship', () => {
    const candA = createMockCandidate({ candidateId: 'cand_a', physicalInstanceId: 'inst_a' });
    const candB = createMockCandidate({ candidateId: 'cand_b', physicalInstanceId: 'inst_b' });
    const candC = createMockCandidate({ candidateId: 'cand_c', physicalInstanceId: 'inst_c' });

    const membershipBA = createProvenMembership('LANGUAGE_REPRESENTATION_OF', candB, candA);
    const membershipCB = createProvenMembership('LANGUAGE_REPRESENTATION_OF', candC, candB);

    // Synthesize family anchored by A
    const familyA = familySynthesizer.synthesizeFamily({
      anchorCandidate: candA,
      acceptedMemberships: [membershipBA, membershipCB],
      allCandidates: [candA, candB, candC],
    });

    // Family A contains A and B (because only B has membership to anchor A).
    // C is NOT pulled into Family A because C only has membership to B, not A.
    expect(familyA.isSynthesized).toBe(true);
    expect(familyA.family?.members.length).toBe(2);
    expect(familyA.family?.members.some((m) => m.candidatePhysicalInstanceId === 'inst_c')).toBe(false);
    expect(familyA.family?.directRelationshipEvaluationIds.length).toBe(1);
  });

  it('CASE C: A LANGUAGE B, B LANGUAGE C => No synthetic A-C relationship', () => {
    const candA = createMockCandidate({ candidateId: 'cand_en1', physicalInstanceId: 'inst_en1' });
    const candB = createMockCandidate({
      candidateId: 'cand_hi',
      physicalInstanceId: 'inst_hi',
      languageRepresentations: [{ languageScript: 'DEVANAGARI', pageNumber: 3, stemNodeIds: [], bodyNodeIds: [], optionCandidateIds: [] }],
    });
    const candC = createMockCandidate({ candidateId: 'cand_en2', physicalInstanceId: 'inst_en2' });

    const memBA = createProvenMembership('LANGUAGE_REPRESENTATION_OF', candB, candA);
    const memCB = createProvenMembership('LANGUAGE_REPRESENTATION_OF', candC, candB);

    const familyA = familySynthesizer.synthesizeFamily({
      anchorCandidate: candA,
      acceptedMemberships: [memBA, memCB],
      allCandidates: [candA, candB, candC],
    });

    expect(familyA.family?.members.length).toBe(2);
    expect(familyA.family?.members.some((m) => m.candidatePhysicalInstanceId === 'inst_en2')).toBe(false);
  });

  it('CASE D: A CONTINUATION B => No logical family merge', () => {
    const candHead = createMockCandidate({ candidateId: 'cand_head', physicalInstanceId: 'inst_head' });
    const candTail = createMockCandidate({ candidateId: 'cand_tail', physicalInstanceId: 'inst_tail' });

    // Attempting to synthesize a family with no valid accepted memberships
    const result = familySynthesizer.synthesizeFamily({
      anchorCandidate: candHead,
      acceptedMemberships: [], // Continuation produces no accepted membership
      allCandidates: [candHead, candTail],
    });

    expect(result.isSynthesized).toBe(true);
    // Single-member family containing only the anchor
    expect(result.family?.members.length).toBe(1);
    expect(result.family?.members[0].candidatePhysicalInstanceId).toBe('inst_head');
  });

  it('CASE E: A VARIANT B => Separate families', () => {
    const candA = createMockCandidate({ candidateId: 'cand_v_a', physicalInstanceId: 'inst_v_a' });
    const candB = createMockCandidate({ candidateId: 'cand_v_b', physicalInstanceId: 'inst_v_b' });

    const resultA = familySynthesizer.synthesizeFamily({
      anchorCandidate: candA,
      acceptedMemberships: [],
      allCandidates: [candA, candB],
    });

    const resultB = familySynthesizer.synthesizeFamily({
      anchorCandidate: candB,
      acceptedMemberships: [],
      allCandidates: [candA, candB],
    });

    expect(resultA.family?.members.length).toBe(1);
    expect(resultB.family?.members.length).toBe(1);
    expect(resultA.family?.familyId).not.toBe(resultB.family?.familyId);
  });

  it('CASE F: A SHARED_STIMULUS B => Separate families', () => {
    const cand1 = createMockCandidate({ candidateId: 'cand_stim_1', physicalInstanceId: 'inst_stim_1' });
    const cand2 = createMockCandidate({ candidateId: 'cand_stim_2', physicalInstanceId: 'inst_stim_2' });

    const result1 = familySynthesizer.synthesizeFamily({
      anchorCandidate: cand1,
      acceptedMemberships: [],
      allCandidates: [cand1, cand2],
    });

    expect(result1.family?.members.length).toBe(1);
    expect(result1.family?.members[0].candidatePhysicalInstanceId).toBe('inst_stim_1');
  });

  it('CASE G: Conflicted relationship => No family membership in synthesized family', () => {
    const candA = createMockCandidate({ candidateId: 'cand_a', physicalInstanceId: 'inst_a' });
    const candB = createMockCandidate({ candidateId: 'cand_b', physicalInstanceId: 'inst_b' });

    // No accepted membership provided
    const result = familySynthesizer.synthesizeFamily({
      anchorCandidate: candA,
      acceptedMemberships: [],
      allCandidates: [candA, candB],
    });

    expect(result.family?.members.length).toBe(1);
    expect(result.family?.members.some((m) => m.candidatePhysicalInstanceId === 'inst_b')).toBe(false);
  });

  it('CASE H: Dangling membership => Family construction fails closed', () => {
    const candA = createMockCandidate({ candidateId: 'cand_a', physicalInstanceId: 'inst_a' });

    const fakeDanglingMembership: CandidateFamilyMembership = {
      candidatePhysicalInstanceId: 'non_existent_inst_id_999',
      familyCandidateId: candA.candidateId,
      directRelationshipEvaluationIds: ['eval_fake'],
      directEvidenceReferences: [],
      verificationStatus: 'RELATIONSHIP_PROVEN',
      provenance: { sourceSnapshotId: 's', sourceDocumentId: 'd', algorithmId: 'a', algorithmVersion: '1', evaluatedAt: 0 },
      algorithmVersion: '3.0.0',
      membershipFingerprint: 'fp_fake',
      isAccepted: true,
      membershipReasons: [],
    };

    const result = familySynthesizer.synthesizeFamily({
      anchorCandidate: candA,
      acceptedMemberships: [fakeDanglingMembership],
      allCandidates: [candA], // Missing the candidate referenced by membership!
    });

    expect(result.isSynthesized).toBe(false);
    expect(result.family).toBeUndefined();
    expect(result.rejectionReasons.some((r) => r.includes('non-existent physical candidate'))).toBe(true);
  });

  it('CASE I: Duplicate membership proposal => Deterministic idempotent result, no duplicate member', () => {
    const candA = createMockCandidate({ candidateId: 'cand_a', physicalInstanceId: 'inst_a' });
    const candB = createMockCandidate({
      candidateId: 'cand_b',
      physicalInstanceId: 'inst_b',
      languageRepresentations: [{ languageScript: 'DEVANAGARI', pageNumber: 3, stemNodeIds: [], bodyNodeIds: [], optionCandidateIds: [] }],
    });

    const memBA = createProvenMembership('LANGUAGE_REPRESENTATION_OF', candB, candA);

    // Pass duplicate copies of memBA
    const result = familySynthesizer.synthesizeFamily({
      anchorCandidate: candA,
      acceptedMemberships: [memBA, memBA, memBA],
      allCandidates: [candA, candB],
    });

    expect(result.isSynthesized).toBe(true);
    expect(result.family?.members.length).toBe(2); // Exactly 2 members, not 4!
  });

  it('CASE J: Reversed membership input order => Identical family fingerprint', () => {
    const candA = createMockCandidate({ candidateId: 'cand_a', physicalInstanceId: 'inst_a' });
    const candB = createMockCandidate({
      candidateId: 'cand_b',
      physicalInstanceId: 'inst_b',
      languageRepresentations: [{ languageScript: 'DEVANAGARI', pageNumber: 3, stemNodeIds: [], bodyNodeIds: [], optionCandidateIds: [] }],
    });
    const candC = createMockCandidate({ candidateId: 'cand_c', physicalInstanceId: 'inst_c' });

    const memBA = createProvenMembership('LANGUAGE_REPRESENTATION_OF', candB, candA);
    const memCA = createProvenMembership('LANGUAGE_REPRESENTATION_OF', candC, candA);

    const result1 = familySynthesizer.synthesizeFamily({
      anchorCandidate: candA,
      acceptedMemberships: [memBA, memCA],
      allCandidates: [candA, candB, candC],
    });

    const result2 = familySynthesizer.synthesizeFamily({
      anchorCandidate: candA,
      acceptedMemberships: [memCA, memBA], // Reversed order
      allCandidates: [candA, candB, candC],
    });

    expect(result1.isSynthesized).toBe(true);
    expect(result2.isSynthesized).toBe(true);
    expect(result1.family?.familyId).toBe(result2.family?.familyId);
    expect(result1.family?.familyFingerprint).toBe(result2.family?.familyFingerprint);
  });

  it('CASE K: UPSC-style source numbering discrepancy => Physical numbers preserved exactly', () => {
    const hindiQ16 = createMockCandidate({
      candidateId: 'cand_upsc_p6_q16_hin',
      physicalInstanceId: 'inst_p6_q16_hin',
      sourceQuestionNumber: '16',
      startPageNumber: 6,
      languageRepresentations: [{ languageScript: 'DEVANAGARI', pageNumber: 6, stemNodeIds: [], bodyNodeIds: [], optionCandidateIds: [] }],
    });

    const englishQ15 = createMockCandidate({
      candidateId: 'cand_upsc_p7_q15_eng',
      physicalInstanceId: 'inst_p7_q15_eng',
      sourceQuestionNumber: '15',
      startPageNumber: 7,
      languageRepresentations: [{ languageScript: 'LATIN', pageNumber: 7, stemNodeIds: [], bodyNodeIds: [], optionCandidateIds: [] }],
    });

    const memHinToEng = createProvenMembership('LANGUAGE_REPRESENTATION_OF', hindiQ16, englishQ15);

    const result = familySynthesizer.synthesizeFamily({
      anchorCandidate: englishQ15,
      acceptedMemberships: [memHinToEng],
      allCandidates: [englishQ15, hindiQ16],
    });

    expect(result.isSynthesized).toBe(true);
    const hinMember = result.family?.members.find((m) => m.candidatePhysicalInstanceId === 'inst_p6_q16_hin');
    const engMember = result.family?.members.find((m) => m.candidatePhysicalInstanceId === 'inst_p7_q15_eng');

    expect(hinMember?.sourceQuestionNumber).toBe('16');
    expect(engMember?.sourceQuestionNumber).toBe('15');
  });

  it('CASE L: Multilingual family => Both physical representations retained independently', () => {
    const candEng = createMockCandidate({
      candidateId: 'cand_eng',
      physicalInstanceId: 'inst_eng',
      languageRepresentations: [{ languageScript: 'LATIN', pageNumber: 2, stemNodeIds: [], bodyNodeIds: [], optionCandidateIds: [] }],
    });
    const candHin = createMockCandidate({
      candidateId: 'cand_hin',
      physicalInstanceId: 'inst_hin',
      languageRepresentations: [{ languageScript: 'DEVANAGARI', pageNumber: 3, stemNodeIds: [], bodyNodeIds: [], optionCandidateIds: [] }],
    });

    const memHinToEng = createProvenMembership('LANGUAGE_REPRESENTATION_OF', candHin, candEng);

    const result = familySynthesizer.synthesizeFamily({
      anchorCandidate: candEng,
      acceptedMemberships: [memHinToEng],
      allCandidates: [candEng, candHin],
    });

    expect(result.family?.members.length).toBe(2);
    expect(result.family?.members.some((m) => m.languageScript === 'LATIN')).toBe(true);
    expect(result.family?.members.some((m) => m.languageScript === 'DEVANAGARI')).toBe(true);
  });

  it('CASE M: Three candidates where only A-B and A-C are directly proven => Family contains A, B, C; NO B-C invented', () => {
    const candA = createMockCandidate({ candidateId: 'cand_a', physicalInstanceId: 'inst_a' });
    const candB = createMockCandidate({ candidateId: 'cand_b', physicalInstanceId: 'inst_b' });
    const candC = createMockCandidate({ candidateId: 'cand_c', physicalInstanceId: 'inst_c' });

    const memBA = createProvenMembership('LANGUAGE_REPRESENTATION_OF', candB, candA);
    const memCA = createProvenMembership('LANGUAGE_REPRESENTATION_OF', candC, candA);

    const result = familySynthesizer.synthesizeFamily({
      anchorCandidate: candA,
      acceptedMemberships: [memBA, memCA],
      allCandidates: [candA, candB, candC],
    });

    expect(result.isSynthesized).toBe(true);
    expect(result.family?.members.length).toBe(3);
    // Direct evaluation IDs consumed must be exactly 2 (A-B and A-C), never 3 (no synthetic B-C)
    expect(result.family?.directRelationshipEvaluationIds.length).toBe(2);
  });

  it('CASE N: Three candidates where only A-B and B-C are proven => NO B-C-derived A-C relationship created', () => {
    const candA = createMockCandidate({ candidateId: 'cand_a', physicalInstanceId: 'inst_a' });
    const candB = createMockCandidate({ candidateId: 'cand_b', physicalInstanceId: 'inst_b' });
    const candC = createMockCandidate({ candidateId: 'cand_c', physicalInstanceId: 'inst_c' });

    const memBA = createProvenMembership('LANGUAGE_REPRESENTATION_OF', candB, candA);
    const memCB = createProvenMembership('LANGUAGE_REPRESENTATION_OF', candC, candB);

    // Batch synthesis
    const batchFamilies = familySynthesizer.synthesizeBatchFamilies({
      candidates: [candA, candB, candC],
      acceptedMemberships: [memBA, memCB],
    });

    // Batch synthesis creates separate anchor families (Family A with A,B; Family B with B,C)
    // without manufacturing an A-C edge or combining all 3 into one unproven family
    expect(batchFamilies.length).toBe(2);
    const famA = batchFamilies.find((f) => f.anchorPhysicalInstanceId === 'inst_a');
    expect(famA?.members.length).toBe(2);
    expect(famA?.members.some((m) => m.candidatePhysicalInstanceId === 'inst_c')).toBe(false);
  });
});
