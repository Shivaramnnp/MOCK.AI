/**
 * UADUE Phase 2D-1 — Real-World Sample Validation Suite
 *
 * Runs RelationshipEvaluationEngine against representative Phase 2C relationship candidates
 * from UPSC, SSC CHSL, GATE, and JEE Advanced real-world exams.
 */

import { describe, it, expect } from 'vitest';
import { RelationshipEvaluationEngine } from './relationshipEvaluationEngine';
import { QuestionCandidate, QuestionRelationshipCandidate } from '../contracts/questionGraph';

describe('UADUE Phase 2D-1 — Real-World Phase 2C Sample Validation', () => {
  const engine = new RelationshipEvaluationEngine();

  it('evaluates representative sample of real-world exam relationship candidates', () => {
    // 1. UPSC Bilingual Spread Pair (Page 2 Verso vs Page 3 Recto)
    const upscHindiQ1: QuestionCandidate = {
      candidateId: 'upsc_p2_q1_hin',
      physicalInstanceId: 'inst_upsc_p2_q1',
      candidateDisplayOrder: 1,
      sourceOrder: 1,
      startPageNumber: 2,
      endPageNumber: 2,
      isMultiPage: false,
      identityCandidate: { physicalInstanceId: 'inst_upsc_p2_q1', numberType: 'QUESTION_NUMBER', confidence: 1.0, supportingEvidenceIds: [] },
      includedPhysicalNodeIds: ['hn1'],
      stemNodeIds: ['hn1'],
      bodyNodeIds: [],
      optionCandidateIds: ['ho1', 'ho2', 'ho3', 'ho4'],
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
      languageRepresentations: [{ languageScript: 'DEVANAGARI', pageNumber: 2, stemNodeIds: ['hn1'], bodyNodeIds: [], optionCandidateIds: ['ho1', 'ho2', 'ho3', 'ho4'] }],
    };

    const upscEngQ1: QuestionCandidate = {
      candidateId: 'upsc_p3_q1_eng',
      physicalInstanceId: 'inst_upsc_p3_q1',
      candidateDisplayOrder: 1,
      sourceOrder: 1,
      startPageNumber: 3,
      endPageNumber: 3,
      isMultiPage: false,
      identityCandidate: { physicalInstanceId: 'inst_upsc_p3_q1', numberType: 'QUESTION_NUMBER', confidence: 1.0, supportingEvidenceIds: [] },
      includedPhysicalNodeIds: ['en1'],
      stemNodeIds: ['en1'],
      bodyNodeIds: [],
      optionCandidateIds: ['eo1', 'eo2', 'eo3', 'eo4'],
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
      languageRepresentations: [{ languageScript: 'LATIN', pageNumber: 3, stemNodeIds: ['en1'], bodyNodeIds: [], optionCandidateIds: ['eo1', 'eo2', 'eo3', 'eo4'] }],
    };

    const upscRel1: QuestionRelationshipCandidate = {
      relationshipId: 'rel_upsc_q1',
      sourceCandidateId: upscHindiQ1.candidateId,
      targetCandidateId: upscEngQ1.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [
        { evidenceId: 'e1', evidenceType: 'MATCHING_PRINTED_NUMERAL', evidenceStrength: 'HARD', sourceNodeIds: [], description: '', confidence: 1.0 },
      ],
      confidenceScore: 0.98,
      verificationStatus: 'RELATIONSHIP_PROVEN',
      isSymmetric: true,
      provenance: { sourceSnapshotId: 's', sourceDocumentId: 'd', createdAt: 0 },
    };

    // 2. UPSC Page 6 Hindi Q16 vs English Q15 Discrepancy Pair
    const upscHindiQ16: QuestionCandidate = {
      ...upscHindiQ1,
      candidateId: 'upsc_p6_q16_hin',
      physicalInstanceId: 'inst_upsc_p6_q16',
      sourceQuestionNumber: '16',
      startPageNumber: 6,
      endPageNumber: 6,
      languageRepresentations: [{ languageScript: 'DEVANAGARI', pageNumber: 6, stemNodeIds: ['hn16'], bodyNodeIds: [], optionCandidateIds: ['ho1', 'ho2', 'ho3', 'ho4'] }],
    };

    const upscEngQ15: QuestionCandidate = {
      ...upscEngQ1,
      candidateId: 'upsc_p7_q15_eng',
      physicalInstanceId: 'inst_upsc_p7_q15',
      sourceQuestionNumber: '15',
      startPageNumber: 7,
      endPageNumber: 7,
      languageRepresentations: [{ languageScript: 'LATIN', pageNumber: 7, stemNodeIds: ['en15'], bodyNodeIds: [], optionCandidateIds: ['eo1', 'eo2', 'eo3', 'eo4'] }],
    };

    const upscRelDiscrepancy: QuestionRelationshipCandidate = {
      relationshipId: 'rel_upsc_disc_p6_p7',
      sourceCandidateId: upscHindiQ16.candidateId,
      targetCandidateId: upscEngQ15.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [],
      confidenceScore: 0.98,
      verificationStatus: 'RELATIONSHIP_PROVEN',
      isSymmetric: true,
      provenance: { sourceSnapshotId: 's', sourceDocumentId: 'd', createdAt: 0 },
    };

    // 3. SSC Sequential Pair (Same script on adjacent pages - should be CONFLICTED for bilingual, but distinct items)
    const sscQ26: QuestionCandidate = {
      ...upscEngQ1,
      candidateId: 'ssc_q26',
      physicalInstanceId: 'inst_ssc_q26',
      startPageNumber: 4,
      endPageNumber: 4,
      languageRepresentations: [{ languageScript: 'LATIN', pageNumber: 4, stemNodeIds: ['s1'], bodyNodeIds: [], optionCandidateIds: ['so1', 'so2', 'so3', 'so4'] }],
    };

    const sscQ27: QuestionCandidate = {
      ...upscEngQ1,
      candidateId: 'ssc_q27',
      physicalInstanceId: 'inst_ssc_q27',
      startPageNumber: 5,
      endPageNumber: 5,
      languageRepresentations: [{ languageScript: 'LATIN', pageNumber: 5, stemNodeIds: ['s2'], bodyNodeIds: [], optionCandidateIds: ['so1', 'so2', 'so3', 'so4'] }],
    };

    const sscRelFakeBilingual: QuestionRelationshipCandidate = {
      relationshipId: 'rel_ssc_fake_bi',
      sourceCandidateId: sscQ26.candidateId,
      targetCandidateId: sscQ27.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [],
      confidenceScore: 0.9,
      verificationStatus: 'RELATIONSHIP_UNVERIFIED',
      isSymmetric: true,
      provenance: { sourceSnapshotId: 's', sourceDocumentId: 'd', createdAt: 0 },
    };

    // 4. GATE Cross-Page Continuation Pair (Page 8 to Page 9)
    const gateQ14Head: QuestionCandidate = {
      ...upscEngQ1,
      candidateId: 'gate_q14_head',
      physicalInstanceId: 'inst_gate_q14_head',
      startPageNumber: 8,
      endPageNumber: 8,
      candidateDisplayOrder: 2,
    };

    const gateQ14Tail: QuestionCandidate = {
      ...upscEngQ1,
      candidateId: 'gate_q14_tail',
      physicalInstanceId: 'inst_gate_q14_tail',
      startPageNumber: 9,
      endPageNumber: 9,
      candidateDisplayOrder: 1,
    };

    const gateRelCont: QuestionRelationshipCandidate = {
      relationshipId: 'rel_gate_q14_cont',
      sourceCandidateId: gateQ14Head.candidateId,
      targetCandidateId: gateQ14Tail.candidateId,
      relationshipType: 'CONTINUATION_OF',
      evidence: [{ evidenceId: 'eg1', evidenceType: 'PAGE_TRANSITION' as any, evidenceStrength: 'SUPPORTING', sourceNodeIds: [], description: '', confidence: 1.0 }],
      confidenceScore: 0.95,
      verificationStatus: 'RELATIONSHIP_PROVEN',
      isSymmetric: false,
      provenance: { sourceSnapshotId: 's', sourceDocumentId: 'd', createdAt: 0 },
    };

    // 5. JEE Shared Stimulus Child Pair
    const jeeStimulus: QuestionCandidate = {
      ...upscEngQ1,
      candidateId: 'jee_stimulus_pass1',
      physicalInstanceId: 'inst_jee_pass1',
      startPageNumber: 12,
      endPageNumber: 12,
    };

    const jeeQ41Child: QuestionCandidate = {
      ...upscEngQ1,
      candidateId: 'jee_q41',
      physicalInstanceId: 'inst_jee_q41',
      startPageNumber: 12,
      endPageNumber: 12,
    };

    const jeeRelStim: QuestionRelationshipCandidate = {
      relationshipId: 'rel_jee_stim_q41',
      sourceCandidateId: jeeQ41Child.candidateId,
      targetCandidateId: jeeStimulus.candidateId,
      relationshipType: 'SHARED_STIMULUS_CHILD_OF',
      evidence: [{ evidenceId: 'ej1', evidenceType: 'SHARED_STIMULUS_EVIDENCE' as any, evidenceStrength: 'SUPPORTING', sourceNodeIds: [], description: '', confidence: 1.0 }],
      confidenceScore: 0.95,
      verificationStatus: 'RELATIONSHIP_PROVEN',
      isSymmetric: false,
      provenance: { sourceSnapshotId: 's', sourceDocumentId: 'd', createdAt: 0 },
    };

    // Run batch evaluation across all 5 sample pairs
    const candidates = [upscHindiQ1, upscEngQ1, upscHindiQ16, upscEngQ15, sscQ26, sscQ27, gateQ14Head, gateQ14Tail, jeeStimulus, jeeQ41Child];
    const relationships = [upscRel1, upscRelDiscrepancy, sscRelFakeBilingual, gateRelCont, jeeRelStim];

    const results = engine.evaluateAllRelationships({ relationships, candidates });

    expect(results.length).toBe(5);

    const provenCount = results.filter((r) => r.verificationStatus === 'RELATIONSHIP_PROVEN').length;
    const conflictedCount = results.filter((r) => r.verificationStatus === 'RELATIONSHIP_CONFLICTED').length;
    const plausibleCount = results.filter((r) => r.verificationStatus === 'RELATIONSHIP_PLAUSIBLE').length;

    expect(provenCount).toBe(4); // upscRel1, upscRelDiscrepancy, gateRelCont, jeeRelStim
    expect(conflictedCount).toBe(1); // sscRelFakeBilingual (same script on facing pages)
    expect(plausibleCount).toBe(0);

    // Verify UPSC Discrepancy pair retains physical instance IDs
    const discResult = results.find((r) => r.relationshipId === 'rel_upsc_disc_p6_p7')!;
    expect(discResult.sourcePhysicalInstanceId).toBe('inst_upsc_p6_q16');
    expect(discResult.targetPhysicalInstanceId).toBe('inst_upsc_p7_q15');
    expect(discResult.isEligibleForFamilySynthesis).toBe(true);

    // Verify GATE continuation does not create family synthesis
    const gateResult = results.find((r) => r.relationshipId === 'rel_gate_q14_cont')!;
    expect(gateResult.isEligibleForFamilySynthesis).toBe(false);

    // Verify JEE shared stimulus does not create family synthesis
    const jeeResult = results.find((r) => r.relationshipId === 'rel_jee_stim_q41')!;
    expect(jeeResult.isEligibleForFamilySynthesis).toBe(false);
  });
});
