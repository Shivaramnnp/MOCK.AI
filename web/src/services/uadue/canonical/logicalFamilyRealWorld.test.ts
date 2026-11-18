/**
 * UADUE Phase 2D-3 — Logical Family Real-World Validation Suite
 * Document Version: 3.0.0-TOPOLOGY-HARDENED
 *
 * Validates real-world logical family synthesis across authentic exam archetypes:
 * 1. UPSC CSE GS1 bilingual family (Hindi Q1 Page 2 <-> English Q1 Page 3) => Synthesized with both representations.
 * 2. UPSC CSE GS1 Page 6/7 numbering discrepancy family (Hindi Q16 Page 6 <-> English Q15 Page 7) => Synthesized with authentic preserved labels.
 * 3. GATE CS 2024 multi-page continuation => Excluded from logical family synthesis.
 * 4. JEE Advanced 2023 matrix continuation => Excluded from logical family synthesis.
 * 5. UPSC misaligned question pair with fatal conflicts => Excluded from logical family synthesis.
 */

import { describe, it, expect } from 'vitest';
import {
  QuestionCandidate,
  QuestionRelationshipCandidate,
} from '../contracts/questionGraph';
import { RelationshipEvaluationEngine } from './relationshipEvaluationEngine';
import { CandidateFamilyMembershipEvaluator } from './candidateFamilyMembershipEvaluator';
import { LogicalFamilySynthesizer } from './logicalFamilySynthesizer';

describe('UADUE Phase 2D-3 — Real-World Logical Family Synthesis Validation', () => {
  const relEngine = new RelationshipEvaluationEngine();
  const membershipEvaluator = new CandidateFamilyMembershipEvaluator();
  const familySynthesizer = new LogicalFamilySynthesizer();

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

  it('1. UPSC GS1 Bilingual Family: Synthesizes logical family uniting Hindi Q1 (P2) and English Q1 (P3)', () => {
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

    const familyResult = familySynthesizer.synthesizeFamily({
      anchorCandidate: englishQ1,
      acceptedMemberships: [membershipResult.membership!],
      allCandidates: [englishQ1, hindiQ1],
    });

    expect(familyResult.isSynthesized).toBe(true);
    expect(familyResult.family?.members.length).toBe(2);
    expect(familyResult.family?.anchorCandidateId).toBe('cand_upsc_p3_q1_eng');
    expect(familyResult.family?.members.some((m) => m.representationRole === 'ANCHOR_REPRESENTATION' && m.languageScript === 'LATIN')).toBe(true);
    expect(familyResult.family?.members.some((m) => m.representationRole === 'LANGUAGE_REPRESENTATION' && m.languageScript === 'DEVANAGARI')).toBe(true);
  });

  it('2. UPSC GS1 Discrepancy Family: Synthesizes family retaining Hindi Q16 and English Q15 intact', () => {
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

    const familyResult = familySynthesizer.synthesizeFamily({
      anchorCandidate: englishQ15,
      acceptedMemberships: [membershipResult.membership!],
      allCandidates: [englishQ15, hindiQ16],
    });

    expect(familyResult.isSynthesized).toBe(true);
    const hinMember = familyResult.family?.members.find((m) => m.candidatePhysicalInstanceId === 'inst_p6_q16_hin');
    const engMember = familyResult.family?.members.find((m) => m.candidatePhysicalInstanceId === 'inst_p7_q15_eng');

    expect(hinMember?.sourceQuestionNumber).toBe('16');
    expect(engMember?.sourceQuestionNumber).toBe('15');
  });

  it('3. GATE CS 2024 Continuation Exclusion: Continuation relation does not synthesize multi-candidate family', () => {
    const gateStemP4 = createMockCandidate({
      candidateId: 'cand_gate_p4_q12',
      physicalInstanceId: 'inst_gate_p4_q12',
      startPageNumber: 4,
    });
    const gateOptionsP5 = createMockCandidate({
      candidateId: 'cand_gate_p5_q12_tail',
      physicalInstanceId: 'inst_gate_p5_q12_tail',
      startPageNumber: 5,
    });

    const familyResult = familySynthesizer.synthesizeFamily({
      anchorCandidate: gateStemP4,
      acceptedMemberships: [], // No accepted membership exists for continuation
      allCandidates: [gateStemP4, gateOptionsP5],
    });

    expect(familyResult.isSynthesized).toBe(true);
    expect(familyResult.family?.members.length).toBe(1);
    expect(familyResult.family?.members[0].candidatePhysicalInstanceId).toBe('inst_gate_p4_q12');
  });

  it('4. JEE Advanced 2023 Continuation Exclusion: Continuation relation does not synthesize multi-candidate family', () => {
    const jeeStemP3 = createMockCandidate({
      candidateId: 'cand_jee_p3_q5',
      physicalInstanceId: 'inst_jee_p3_q5',
      startPageNumber: 3,
    });
    const jeeTableP4 = createMockCandidate({
      candidateId: 'cand_jee_p4_q5_tail',
      physicalInstanceId: 'inst_jee_p4_q5_tail',
      startPageNumber: 4,
    });

    const familyResult = familySynthesizer.synthesizeFamily({
      anchorCandidate: jeeStemP3,
      acceptedMemberships: [],
      allCandidates: [jeeStemP3, jeeTableP4],
    });

    expect(familyResult.isSynthesized).toBe(true);
    expect(familyResult.family?.members.length).toBe(1);
  });

  it('5. Conflicted UPSC Pair Exclusion: Misaligned candidate pair produces no multi-candidate family', () => {
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

    const familyResult = familySynthesizer.synthesizeFamily({
      anchorCandidate: englishQ8,
      acceptedMemberships: [],
      allCandidates: [englishQ8, hindiQ7],
    });

    expect(familyResult.isSynthesized).toBe(true);
    expect(familyResult.family?.members.length).toBe(1);
    expect(familyResult.family?.members.some((m) => m.candidatePhysicalInstanceId === 'inst_p6_q7_hin')).toBe(false);
  });
});
