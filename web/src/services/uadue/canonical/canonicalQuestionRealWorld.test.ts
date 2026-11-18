/**
 * UADUE Phase 2D-4 — Canonical Question Real-World Validation Suite
 * Document Version: 4.0.0-TOPOLOGY-HARDENED
 *
 * Validates real-world CanonicalQuestionIR synthesis across authentic exam archetypes:
 * 1. UPSC CSE GS1 bilingual family (Hindi Q1 Page 2 <-> English Q1 Page 3) => Dual representations preserved.
 * 2. UPSC CSE GS1 Page 6/7 numbering discrepancy family (Hindi Q16 Page 6 <-> English Q15 Page 7) => Both numbers preserved.
 * 3. GATE CS 2024 continuation exclusion => Canonical IR reflects single physical candidate.
 * 4. JEE Advanced 2023 continuation exclusion => Canonical IR reflects single physical candidate.
 * 5. Conflicted UPSC pair => Produces separate distinct canonical questions.
 */

import { describe, it, expect } from 'vitest';
import {
  QuestionCandidate,
  QuestionRelationshipCandidate,
} from '../contracts/questionGraph';
import { RelationshipEvaluationEngine } from './relationshipEvaluationEngine';
import { CandidateFamilyMembershipEvaluator } from './candidateFamilyMembershipEvaluator';
import { LogicalFamilySynthesizer } from './logicalFamilySynthesizer';
import { CanonicalQuestionSynthesizer } from './canonicalQuestionSynthesizer';

describe('UADUE Phase 2D-4 — Real-World Canonical Question Validation', () => {
  const relEngine = new RelationshipEvaluationEngine();
  const membershipEvaluator = new CandidateFamilyMembershipEvaluator();
  const familySynthesizer = new LogicalFamilySynthesizer();
  const canonicalSynthesizer = new CanonicalQuestionSynthesizer();

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

  it('1. UPSC GS1 Bilingual Question: Synthesizes CanonicalQuestionIR with lossless English + Hindi representations', () => {
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

    const evalResult = relEngine.evaluateRelationship({ relationship: rel, sourceCandidate: hindiQ1, targetCandidate: englishQ1 });
    const memResult = membershipEvaluator.evaluateMembership({ candidate: hindiQ1, familyTargetCandidate: englishQ1, directRelationshipEvaluation: evalResult });
    const famResult = familySynthesizer.synthesizeFamily({ anchorCandidate: englishQ1, acceptedMemberships: [memResult.membership!], allCandidates: [englishQ1, hindiQ1] });

    const canonicalResult = canonicalSynthesizer.synthesizeCanonicalQuestion({
      family: famResult.family!,
      candidates: [englishQ1, hindiQ1],
    });

    expect(canonicalResult.isCanonicalized).toBe(true);
    expect(canonicalResult.canonicalQuestion?.representations.length).toBe(2);
    expect(canonicalResult.canonicalQuestion?.memberPhysicalInstanceIds).toContain('inst_p3_q1_eng');
    expect(canonicalResult.canonicalQuestion?.memberPhysicalInstanceIds).toContain('inst_p2_q1_hin');
  });

  it('2. UPSC GS1 Discrepancy Question: Preserves authentic Hindi 16 vs English 15 numbering in CanonicalQuestionIR', () => {
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
      ],
      confidenceScore: 0.98,
      verificationStatus: 'RELATIONSHIP_PROVEN',
      isSymmetric: true,
      provenance: { sourceSnapshotId: 'snap_upsc', sourceDocumentId: 'doc_upsc', createdAt: 0 },
    };

    const evalResult = relEngine.evaluateRelationship({ relationship: rel, sourceCandidate: hindiQ16, targetCandidate: englishQ15 });
    const memResult = membershipEvaluator.evaluateMembership({ candidate: hindiQ16, familyTargetCandidate: englishQ15, directRelationshipEvaluation: evalResult });
    const famResult = familySynthesizer.synthesizeFamily({ anchorCandidate: englishQ15, acceptedMemberships: [memResult.membership!], allCandidates: [englishQ15, hindiQ16] });

    const canonicalResult = canonicalSynthesizer.synthesizeCanonicalQuestion({
      family: famResult.family!,
      candidates: [englishQ15, hindiQ16],
    });

    expect(canonicalResult.isCanonicalized).toBe(true);
    expect(canonicalResult.canonicalQuestion?.sourceDiscrepancies.hasNumberingDiscrepancy).toBe(true);
    const num16 = canonicalResult.canonicalQuestion?.sourceDiscrepancies.sourceNumberings.find((s) => s.printedQuestionNumber === '16');
    const num15 = canonicalResult.canonicalQuestion?.sourceDiscrepancies.sourceNumberings.find((s) => s.printedQuestionNumber === '15');
    expect(num16?.candidatePhysicalInstanceId).toBe('inst_p6_q16_hin');
    expect(num15?.candidatePhysicalInstanceId).toBe('inst_p7_q15_eng');
  });

  it('3. GATE CS 2024 Continuation: CanonicalQuestionIR accurately reflects isolated single candidate', () => {
    const gateStemP4 = createMockCandidate({
      candidateId: 'cand_gate_p4_q12',
      physicalInstanceId: 'inst_gate_p4_q12',
      startPageNumber: 4,
    });

    const famResult = familySynthesizer.synthesizeFamily({
      anchorCandidate: gateStemP4,
      acceptedMemberships: [],
      allCandidates: [gateStemP4],
    });

    const canonicalResult = canonicalSynthesizer.synthesizeCanonicalQuestion({
      family: famResult.family!,
      candidates: [gateStemP4],
    });

    expect(canonicalResult.isCanonicalized).toBe(true);
    expect(canonicalResult.canonicalQuestion?.memberPhysicalInstanceIds).toEqual(['inst_gate_p4_q12']);
    expect(canonicalResult.canonicalQuestion?.representations.length).toBe(1);
  });

  it('4. JEE Advanced 2023 Continuation: CanonicalQuestionIR accurately reflects isolated single candidate', () => {
    const jeeStemP3 = createMockCandidate({
      candidateId: 'cand_jee_p3_q5',
      physicalInstanceId: 'inst_jee_p3_q5',
      startPageNumber: 3,
    });

    const famResult = familySynthesizer.synthesizeFamily({
      anchorCandidate: jeeStemP3,
      acceptedMemberships: [],
      allCandidates: [jeeStemP3],
    });

    const canonicalResult = canonicalSynthesizer.synthesizeCanonicalQuestion({
      family: famResult.family!,
      candidates: [jeeStemP3],
    });

    expect(canonicalResult.isCanonicalized).toBe(true);
    expect(canonicalResult.canonicalQuestion?.memberPhysicalInstanceIds).toEqual(['inst_jee_p3_q5']);
  });

  it('5. Conflicted UPSC Pair: Produces separate distinct canonical questions', () => {
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

    const fam7 = familySynthesizer.synthesizeFamily({ anchorCandidate: hindiQ7, acceptedMemberships: [], allCandidates: [hindiQ7, englishQ8] });
    const fam8 = familySynthesizer.synthesizeFamily({ anchorCandidate: englishQ8, acceptedMemberships: [], allCandidates: [hindiQ7, englishQ8] });

    const can7 = canonicalSynthesizer.synthesizeCanonicalQuestion({ family: fam7.family!, candidates: [hindiQ7] });
    const can8 = canonicalSynthesizer.synthesizeCanonicalQuestion({ family: fam8.family!, candidates: [englishQ8] });

    expect(can7.canonicalQuestion?.canonicalQuestionId).not.toBe(can8.canonicalQuestion?.canonicalQuestionId);
    expect(can7.canonicalQuestion?.memberPhysicalInstanceIds).toEqual(['inst_p6_q7_hin']);
    expect(can8.canonicalQuestion?.memberPhysicalInstanceIds).toEqual(['inst_p7_q8_eng']);
  });
});
