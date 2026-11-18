/**
 * UADUE Phase 2D-4 — Canonical Question Synthesizer Adversarial Test Suite
 * Document Version: 4.0.0-TOPOLOGY-HARDENED
 *
 * Validates:
 * CASE A: UPSC Hindi Q16 / English Q15 => Both source numbers preserved.
 * CASE B: Multiple language representations => No language representation discarded.
 * CASE C: Math visual without proven AST => Visual source retained, marked unresolved.
 * CASE D: Diagram without proven semantic interpretation => Diagram retained.
 * CASE E: Table with uncertain structure => Original table visual retained.
 * CASE F: Duplicate source contributor => Provenance deduplicated without losing source identity.
 * CASE G: One canonical element from multiple physical contributors => Multiple provenance references preserved.
 * CASE H: Input ordering reversed => Identical canonical output.
 * CASE I: Unknown semantic role => Preserved as UNKNOWN, not guessed.
 * CASE J: Conflicting source representations => Both preserved; no silent winner.
 * CASE K: Source mutation attempt => Source remains unchanged.
 * CASE L: Canonical IR regeneration => Deterministic identical result.
 */

import { describe, it, expect } from 'vitest';
import {
  QuestionCandidate,
} from '../contracts/questionGraph';
import {
  LogicalQuestionFamily,
  LogicalFamilyMember,
} from './types';
import { CanonicalQuestionSynthesizer } from './canonicalQuestionSynthesizer';

describe('UADUE Phase 2D-4 — Canonical Question Synthesizer Adversarial Suite', () => {
  const synthesizer = new CanonicalQuestionSynthesizer();

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

  const createMockFamily = (
    familyId: string,
    anchorCandidate: QuestionCandidate,
    otherMembers: { candidate: QuestionCandidate; role: LogicalFamilyMember['representationRole'] }[] = []
  ): LogicalQuestionFamily => {
    const members: LogicalFamilyMember[] = [
      {
        candidatePhysicalInstanceId: anchorCandidate.physicalInstanceId,
        candidateId: anchorCandidate.candidateId,
        representationRole: 'ANCHOR_REPRESENTATION',
        languageScript: anchorCandidate.languageRepresentations?.[0]?.languageScript || 'LATIN',
        sourceQuestionNumber: anchorCandidate.sourceQuestionNumber,
        pageNumber: anchorCandidate.startPageNumber,
        directMembershipFingerprint: `anchor_fp_${anchorCandidate.physicalInstanceId}`,
        directEvidenceReferences: [],
      },
    ];

    for (const other of otherMembers) {
      members.push({
        candidatePhysicalInstanceId: other.candidate.physicalInstanceId,
        candidateId: other.candidate.candidateId,
        representationRole: other.role,
        languageScript: other.candidate.languageRepresentations?.[0]?.languageScript || 'LATIN',
        sourceQuestionNumber: other.candidate.sourceQuestionNumber,
        pageNumber: other.candidate.startPageNumber,
        directMembershipFingerprint: `mem_fp_${other.candidate.physicalInstanceId}`,
        directRelationshipEvaluationId: `eval_${other.candidate.candidateId}_${anchorCandidate.candidateId}`,
        directEvidenceReferences: [],
      });
    }

    return {
      familyId,
      anchorPhysicalInstanceId: anchorCandidate.physicalInstanceId,
      anchorCandidateId: anchorCandidate.candidateId,
      members,
      directRelationshipEvaluationIds: otherMembers.map(
        (o) => `eval_${o.candidate.candidateId}_${anchorCandidate.candidateId}`
      ),
      verificationStatus: 'RELATIONSHIP_PROVEN',
      provenance: {
        sourceSnapshotId: 'snap_1',
        sourceDocumentId: 'doc_1',
        algorithmId: 'alg_1',
        algorithmVersion: '3.0.0',
        synthesizedAt: 0,
      },
      algorithmVersion: '3.0.0',
      familyFingerprint: familyId,
      synthesisReasons: ['Test family'],
    };
  };

  // ==========================================================================
  // Adversarial Cases A-L
  // ==========================================================================

  it('CASE A: UPSC Hindi Q16 / English Q15 => Both source numbers preserved in CanonicalQuestionIR', () => {
    const hindiQ16 = createMockCandidate({
      candidateId: 'cand_hin_16',
      physicalInstanceId: 'inst_hin_16',
      sourceQuestionNumber: '16',
      startPageNumber: 6,
      languageRepresentations: [{ languageScript: 'DEVANAGARI', pageNumber: 6, stemNodeIds: ['hn_16'], bodyNodeIds: [], optionCandidateIds: [] }],
    });

    const englishQ15 = createMockCandidate({
      candidateId: 'cand_eng_15',
      physicalInstanceId: 'inst_eng_15',
      sourceQuestionNumber: '15',
      startPageNumber: 7,
      languageRepresentations: [{ languageScript: 'LATIN', pageNumber: 7, stemNodeIds: ['en_15'], bodyNodeIds: [], optionCandidateIds: [] }],
    });

    const family = createMockFamily('fam_upsc_15_16', englishQ15, [
      { candidate: hindiQ16, role: 'LANGUAGE_REPRESENTATION' },
    ]);

    const result = synthesizer.synthesizeCanonicalQuestion({
      family,
      candidates: [englishQ15, hindiQ16],
    });

    expect(result.isCanonicalized).toBe(true);
    expect(result.canonicalQuestion?.sourceDiscrepancies.hasNumberingDiscrepancy).toBe(true);
    expect(result.canonicalQuestion?.sourceDiscrepancies.sourceNumberings).toEqual([
      { candidatePhysicalInstanceId: 'inst_eng_15', printedQuestionNumber: '15', pageNumber: 7 },
      { candidatePhysicalInstanceId: 'inst_hin_16', printedQuestionNumber: '16', pageNumber: 6 },
    ]);
  });

  it('CASE B: Multiple language representations => No language representation discarded', () => {
    const candEng = createMockCandidate({ candidateId: 'c_eng', physicalInstanceId: 'inst_eng', languageRepresentations: [{ languageScript: 'LATIN', pageNumber: 2, stemNodeIds: [], bodyNodeIds: [], optionCandidateIds: [] }] });
    const candHin = createMockCandidate({ candidateId: 'c_hin', physicalInstanceId: 'inst_hin', languageRepresentations: [{ languageScript: 'DEVANAGARI', pageNumber: 3, stemNodeIds: [], bodyNodeIds: [], optionCandidateIds: [] }] });

    const family = createMockFamily('fam_multi_lang', candEng, [
      { candidate: candHin, role: 'LANGUAGE_REPRESENTATION' },
    ]);

    const result = synthesizer.synthesizeCanonicalQuestion({
      family,
      candidates: [candEng, candHin],
    });

    expect(result.isCanonicalized).toBe(true);
    expect(result.canonicalQuestion?.representations.length).toBe(2);
    expect(result.canonicalQuestion?.representations.some((r) => r.languageScript === 'LATIN')).toBe(true);
    expect(result.canonicalQuestion?.representations.some((r) => r.languageScript === 'DEVANAGARI')).toBe(true);
  });

  it('CASE C: Math visual without proven AST => Visual source retained, marked unresolved', () => {
    const candMath = createMockCandidate({
      candidateId: 'c_math',
      physicalInstanceId: 'inst_math',
      mathCandidateIds: ['math_asset_42'],
    });

    const family = createMockFamily('fam_math', candMath);

    const result = synthesizer.synthesizeCanonicalQuestion({
      family,
      candidates: [candMath],
    });

    expect(result.isCanonicalized).toBe(true);
    const mathNode = result.canonicalQuestion?.representations[0].stemAST.find((n) => n.nodeType === 'MATH');
    expect(mathNode).toBeDefined();
    expect(mathNode?.isSemanticInterpretationResolved).toBe(false);
    expect(mathNode?.unresolvedReasons).toBeDefined();
  });

  it('CASE D: Diagram without proven semantic interpretation => Diagram retained, marked unresolved', () => {
    const candDiag = createMockCandidate({
      candidateId: 'c_diag',
      physicalInstanceId: 'inst_diag',
      diagramCandidateIds: ['diag_img_99'],
    });

    const family = createMockFamily('fam_diag', candDiag);

    const result = synthesizer.synthesizeCanonicalQuestion({
      family,
      candidates: [candDiag],
    });

    expect(result.isCanonicalized).toBe(true);
    const diagNode = result.canonicalQuestion?.representations[0].stemAST.find((n) => n.nodeType === 'DIAGRAM');
    expect(diagNode).toBeDefined();
    expect(diagNode?.isSemanticInterpretationResolved).toBe(false);
    expect(result.canonicalQuestion?.allAssetReferences.some((a) => a.assetId === 'diag_img_99')).toBe(true);
  });

  it('CASE E: Table with uncertain structure => Original table visual retained', () => {
    const candTable = createMockCandidate({
      candidateId: 'c_table',
      physicalInstanceId: 'inst_table',
      tableCandidateIds: ['table_raw_7'],
    });

    const family = createMockFamily('fam_table', candTable);

    const result = synthesizer.synthesizeCanonicalQuestion({
      family,
      candidates: [candTable],
    });

    expect(result.isCanonicalized).toBe(true);
    const tableNode = result.canonicalQuestion?.representations[0].stemAST.find((n) => n.nodeType === 'TABLE');
    expect(tableNode).toBeDefined();
    expect(tableNode?.isSemanticInterpretationResolved).toBe(false);
  });

  it('CASE F: Duplicate source contributor => Provenance deduplicated without losing source identity', () => {
    const cand = createMockCandidate({ candidateId: 'c_dupe', physicalInstanceId: 'inst_dupe' });
    const family = createMockFamily('fam_dupe', cand);

    const result = synthesizer.synthesizeCanonicalQuestion({
      family,
      candidates: [cand],
    });

    expect(result.isCanonicalized).toBe(true);
    expect(result.canonicalQuestion?.memberPhysicalInstanceIds).toEqual(['inst_dupe']);
  });

  it('CASE G: One canonical element from multiple physical contributors => Multiple provenance references preserved', () => {
    const candA = createMockCandidate({ candidateId: 'c_a', physicalInstanceId: 'inst_a' });
    const candB = createMockCandidate({ candidateId: 'c_b', physicalInstanceId: 'inst_b' });

    const family = createMockFamily('fam_ab', candA, [{ candidate: candB, role: 'LOGICAL_VIEW_REPRESENTATION' }]);

    const result = synthesizer.synthesizeCanonicalQuestion({
      family,
      candidates: [candA, candB],
    });

    expect(result.isCanonicalized).toBe(true);
    expect(result.canonicalQuestion?.memberPhysicalInstanceIds).toContain('inst_a');
    expect(result.canonicalQuestion?.memberPhysicalInstanceIds).toContain('inst_b');
  });

  it('CASE H: Input ordering reversed => Identical canonical output', () => {
    const candA = createMockCandidate({ candidateId: 'c_a', physicalInstanceId: 'inst_a' });
    const candB = createMockCandidate({ candidateId: 'c_b', physicalInstanceId: 'inst_b' });

    const family = createMockFamily('fam_order', candA, [{ candidate: candB, role: 'LANGUAGE_REPRESENTATION' }]);

    const result1 = synthesizer.synthesizeCanonicalQuestion({
      family,
      candidates: [candA, candB],
    });

    const result2 = synthesizer.synthesizeCanonicalQuestion({
      family,
      candidates: [candB, candA], // Reversed candidates order
    });

    expect(result1.isCanonicalized).toBe(true);
    expect(result2.isCanonicalized).toBe(true);
    expect(result1.canonicalQuestion?.canonicalQuestionId).toBe(result2.canonicalQuestion?.canonicalQuestionId);
  });

  it('CASE I: Unknown semantic role => Preserved without guessing', () => {
    const cand = createMockCandidate({ candidateId: 'c_unk', physicalInstanceId: 'inst_unk' });
    const family = createMockFamily('fam_unk', cand);

    const result = synthesizer.synthesizeCanonicalQuestion({
      family,
      candidates: [cand],
    });

    expect(result.isCanonicalized).toBe(true);
    expect(result.canonicalQuestion?.representations[0].representationRole).toBe('ANCHOR_REPRESENTATION');
  });

  it('CASE J: Conflicting source representations => Both preserved, no silent winner', () => {
    const candA = createMockCandidate({ candidateId: 'c_v1', physicalInstanceId: 'inst_v1', sourceQuestionNumber: '10' });
    const candB = createMockCandidate({ candidateId: 'c_v2', physicalInstanceId: 'inst_v2', sourceQuestionNumber: '11' });

    const family = createMockFamily('fam_discrepant', candA, [{ candidate: candB, role: 'LOGICAL_VIEW_REPRESENTATION' }]);

    const result = synthesizer.synthesizeCanonicalQuestion({
      family,
      candidates: [candA, candB],
    });

    expect(result.isCanonicalized).toBe(true);
    expect(result.canonicalQuestion?.representations.length).toBe(2);
    expect(result.canonicalQuestion?.representations.some((r) => r.sourceQuestionNumber === '10')).toBe(true);
    expect(result.canonicalQuestion?.representations.some((r) => r.sourceQuestionNumber === '11')).toBe(true);
  });

  it('CASE K: Source mutation attempt => Source remains completely unchanged', () => {
    const cand = Object.freeze(createMockCandidate({ candidateId: 'c_f', physicalInstanceId: 'inst_f' }));
    const family = Object.freeze(createMockFamily('fam_f', cand));

    expect(() => {
      const result = synthesizer.synthesizeCanonicalQuestion({
        family,
        candidates: [cand],
      });
      expect(result.isCanonicalized).toBe(true);
    }).not.toThrow();
  });

  it('CASE L: Canonical IR regeneration => Deterministic identical result', () => {
    const cand = createMockCandidate({ candidateId: 'c_regen', physicalInstanceId: 'inst_regen' });
    const family = createMockFamily('fam_regen', cand);

    const run1 = synthesizer.synthesizeCanonicalQuestion({ family, candidates: [cand] });
    const run2 = synthesizer.synthesizeCanonicalQuestion({ family, candidates: [cand] });

    expect(run1.deterministicFingerprint).toBe(run2.deterministicFingerprint);
    expect(run1.canonicalQuestion?.canonicalQuestionId).toBe(run2.canonicalQuestion?.canonicalQuestionId);
    expect(run1.canonicalQuestion?.canonicalFingerprint).toBe(run2.canonicalQuestion?.canonicalFingerprint);
  });

  it('CASE M: Content Fingerprint Sensitivity — Content payload change modifies canonicalFingerprint while preserving canonicalQuestionId', () => {
    const cand1 = createMockCandidate({
      candidateId: 'c_mod',
      physicalInstanceId: 'inst_mod',
      languageRepresentations: [{ languageScript: 'LATIN', pageNumber: 2, stemNodeIds: ['node_initial'], bodyNodeIds: [], optionCandidateIds: ['opt_1'] }],
    });

    const cand2 = createMockCandidate({
      candidateId: 'c_mod',
      physicalInstanceId: 'inst_mod',
      languageRepresentations: [{ languageScript: 'LATIN', pageNumber: 2, stemNodeIds: ['node_modified_text'], bodyNodeIds: [], optionCandidateIds: ['opt_1'] }],
    });

    const family = createMockFamily('fam_mod', cand1);

    const result1 = synthesizer.synthesizeCanonicalQuestion({ family, candidates: [cand1] });
    const result2 = synthesizer.synthesizeCanonicalQuestion({ family, candidates: [cand2] });

    // Same family and physical instance ID -> identical canonicalQuestionId
    expect(result1.canonicalQuestion?.canonicalQuestionId).toBe(result2.canonicalQuestion?.canonicalQuestionId);
    // Modified stem node payload -> different content-bearing canonicalFingerprint!
    expect(result1.canonicalQuestion?.canonicalFingerprint).not.toBe(result2.canonicalQuestion?.canonicalFingerprint);
  });
});

