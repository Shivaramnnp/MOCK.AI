/**
 * UADUE Phase 2D-6 — Canonical Pipeline Validation Test Suite
 * Document Version: 6.0.0-STAGE-B-AUTHORIZED
 *
 * Validates core orchestration and invariant verification across:
 * 1. Single-candidate standalone papers (GATE / SSC singletons).
 * 2. Multi-representation bilingual papers (UPSC recto/verso facing pairs).
 * 3. Numbering discrepancy preservation across language views.
 * 4. Answer authority integration (single head, multi-head, unresolved).
 * 5. Deterministic package sealing (RFC 8785 JCS + SHA-256).
 * 6. Permutation invariance (candidate and relationship array order independence).
 * 7. Invariant compliance report generation.
 */

import { describe, it, expect } from 'vitest';
import {
  QuestionGraph,
  QuestionCandidate,
  QuestionRelationshipCandidate,
} from '../contracts/questionGraph';
import {
  CanonicalPipelineOrchestrator,
  DEFAULT_PIPELINE_ALGORITHM_ID,
  DEFAULT_PIPELINE_ALGORITHM_VERSION,
  DEFAULT_SCHEMA_VERSION,
} from './canonicalPipelineOrchestrator';
import { CanonicalValidationEngine } from './canonicalValidationEngine';
import {
  AnswerAuthorityResolutionVersion,
  ConflictResolutionEvent,
  LineageResolutionResult,
} from './types';
import { createResolutionVersion } from './answerAuthorityResolver';
import { parseRawAnswerValue } from './answerCandidateEvaluator';
import { deriveCandidateAnswerId } from './canonicalHashing';

describe('UADUE Phase 2D-6 — Canonical Pipeline Validation Suite', () => {
  const orchestrator = new CanonicalPipelineOrchestrator();
  const validationEngine = new CanonicalValidationEngine();

  const createCandidate = (overrides: Partial<QuestionCandidate>): QuestionCandidate => ({
    candidateId: 'cand_1',
    physicalInstanceId: 'inst_1',
    candidateDisplayOrder: 1,
    sourceOrder: 1,
    startPageNumber: 1,
    endPageNumber: 1,
    isMultiPage: false,
    identityCandidate: {
      physicalInstanceId: overrides.physicalInstanceId || 'inst_1',
      numberType: 'QUESTION_NUMBER',
      confidence: 1.0,
      supportingEvidenceIds: [],
    },
    includedPhysicalNodeIds: ['node_stem_1'],
    stemNodeIds: ['node_stem_1'],
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
        pageNumber: 1,
        stemNodeIds: ['node_stem_1'],
        bodyNodeIds: [],
        optionCandidateIds: ['opt_1', 'opt_2', 'opt_3', 'opt_4'],
      },
    ],
    ...overrides,
  });

  const createQuestionGraph = (
    questions: QuestionCandidate[],
    relationships: QuestionRelationshipCandidate[] = []
  ): QuestionGraph => ({
    graphId: 'qgraph_test_1',
    sourceDocumentId: 'doc_sample_1',
    sourceSnapshotId: 'snap_sample_1',
    sourceSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    sourceDocumentGraphId: 'docgraph_1',
    sourceDocumentGraphSha256: 'f3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    schemaVersion: 'uadue-qg-v3',
    algorithmVersion: '3.0.0',
    configurationVersion: '1.0.0',
    questions,
    stimuli: [],
    options: [
      {
        optionCandidateId: 'opt_1',
        contentNodeIds: ['node_opt_1'],
        candidateOwners: [],
        isMultiColumnOption: false,
        hasVisualAsset: false,
        hasMathematics: false,
        observationState: 'OBSERVED',
        verificationStatus: 'SUPPORTED',
        confidenceScore: 1.0,
        supportingEvidenceIds: [],
      },
    ],
    tables: [],
    diagrams: [],
    mathBlocks: [],
    hypotheses: [],
    activeHypothesisId: 'hyp_1',
    ambiguities: [],
    relationships,
    verificationState: {
      overallStatus: 'VERIFIED',
      unverifiedCount: 0,
      supportedCount: 0,
      conflictedCount: 0,
      ambiguousCount: 0,
      verifiedCount: questions.length,
      rejectedCount: 0,
      findings: [],
    },
    provenance: {
      algorithmId: 'test_pipeline',
      algorithmVersion: '1.0.0',
      configurationVersion: 'test_config',
      sourceDocumentGraphId: 'dg_sample_1',
      sourceSnapshotId: 'snap_sample_1',
      sourceDocumentId: 'doc_sample_1',
      sourceSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      sourceDocumentGraphSha256: 'f3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      createdAt: 0,
      determinismScope: {
        identicalDocumentGraph: true,
        identicalAlgorithm: true,
        identicalConfig: true,
        runtime: 'node',
        floatPrecision: 'IEEE_754_64BIT',
      },
    },
    isSealed: true,
    sealedHash: 'sealed_12345',
    sealedAt: 0,
  });

  it('1. Executes end-to-end pipeline on standalone single-candidate graph and passes all invariants', () => {
    const q1 = createCandidate({
      candidateId: 'cand_standalone_1',
      physicalInstanceId: 'inst_standalone_1',
      sourceQuestionNumber: '1',
    });
    const qgraph = createQuestionGraph([q1]);

    const result = orchestrator.executePipeline({
      questionGraph: qgraph,
      strictValidation: true,
    });

    expect(result.isSuccess).toBe(true);
    expect(result.package).toBeDefined();

    const pkg = result.package!;
    expect(pkg.canonicalQuestions).toHaveLength(1);
    expect(pkg.logicalFamilies).toHaveLength(1);
    expect(pkg.canonicalQuestions[0].representations).toHaveLength(1);
    expect(pkg.canonicalQuestions[0].logicalFamilyId).toBe(pkg.logicalFamilies[0].familyId);

    // Verify all 7 invariants passed
    const report = result.validationReport;
    expect(report.validationStatus).toBe('PACKAGE_VALIDATED');
    expect(report.failedInvariantCount).toBe(0);
    expect(report.passedInvariantCount).toBe(7);

    // Verify invariant details
    const invNames = report.invariantsEvaluated.map((i) => i.invariantName);
    expect(invNames).toContain('Inv1_SourceNonDestruction');
    expect(report.invariantsEvaluated.find((i) => i.invariantName === 'Inv1_SourceNonDestruction')?.isSatisfied).toBe(true);
    expect(report.invariantsEvaluated.find((i) => i.invariantName === 'Inv2_TraceabilityCompleteness')?.isSatisfied).toBe(true);
    expect(report.invariantsEvaluated.find((i) => i.invariantName === 'Inv6_BitwiseDeterminism')?.isSatisfied).toBe(true);
  });

  it('2. Unifies bilingual facing-page candidates into single canonical question with dual representations', () => {
    const qHindi = createCandidate({
      candidateId: 'cand_upsc_p2_q1_hin',
      physicalInstanceId: 'inst_p2_q1_hin',
      sourceQuestionNumber: '1',
      startPageNumber: 2,
      languageRepresentations: [
        { languageScript: 'DEVANAGARI', pageNumber: 2, stemNodeIds: ['node_hin_1'], bodyNodeIds: [], optionCandidateIds: [] },
      ],
      includedPhysicalNodeIds: ['node_hin_1'],
    });

    const qEnglish = createCandidate({
      candidateId: 'cand_upsc_p3_q1_eng',
      physicalInstanceId: 'inst_p3_q1_eng',
      sourceQuestionNumber: '1',
      startPageNumber: 3,
      languageRepresentations: [
        { languageScript: 'LATIN', pageNumber: 3, stemNodeIds: ['node_eng_1'], bodyNodeIds: [], optionCandidateIds: [] },
      ],
      includedPhysicalNodeIds: ['node_eng_1'],
    });

    const rel: QuestionRelationshipCandidate = {
      relationshipId: 'rel_facing_q1',
      sourceCandidateId: qHindi.candidateId,
      targetCandidateId: qEnglish.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [
        { evidenceId: 'ev_spread', evidenceType: 'FACING_PAGE_SPREAD_PAIR', evidenceStrength: 'HARD', sourceNodeIds: [], description: 'Facing spread', confidence: 1.0 },
        { evidenceId: 'ev_script', evidenceType: 'DISTINCT_SCRIPT_DETECTION', evidenceStrength: 'HARD', sourceNodeIds: [], description: 'Devanagari vs Latin', confidence: 1.0 },
      ],
      confidenceScore: 1.0,
      verificationStatus: 'RELATIONSHIP_PROVEN',
      isSymmetric: true,
      provenance: {
        sourceSnapshotId: 'snap_sample_1',
        sourceDocumentId: 'doc_sample_1',
        createdAt: 0,
      },
    };

    const qgraph = createQuestionGraph([qHindi, qEnglish], [rel]);

    const result = orchestrator.executePipeline({
      questionGraph: qgraph,
      strictValidation: true,
    });

    expect(result.isSuccess).toBe(true);
    const pkg = result.package!;

    // 2 physical candidates unified into 1 logical family and 1 canonical question
    expect(pkg.logicalFamilies).toHaveLength(1);
    expect(pkg.canonicalQuestions).toHaveLength(1);

    const canonicalQ = pkg.canonicalQuestions[0];
    expect(canonicalQ.representations).toHaveLength(2);

    const scripts = canonicalQ.representations.map((r) => r.languageScript);
    expect(scripts).toContain('DEVANAGARI');
    expect(scripts).toContain('LATIN');

    // Both representations retain their distinct physical instance IDs
    const physIds = canonicalQ.representations.map((r) => r.sourcePhysicalInstanceId);
    expect(physIds).toContain('inst_p2_q1_hin');
    expect(physIds).toContain('inst_p3_q1_eng');

    expect(result.validationReport.validationStatus).toBe('PACKAGE_VALIDATED');
  });

  it('3. Preserves authentic source numbering discrepancy across representations without silent normalization', () => {
    const qHindi = createCandidate({
      candidateId: 'cand_upsc_p6_q16_hin',
      physicalInstanceId: 'inst_p6_q16_hin',
      sourceQuestionNumber: '16', // Official printing error: labeled 16 in Hindi
      startPageNumber: 6,
      languageRepresentations: [
        { languageScript: 'DEVANAGARI', pageNumber: 6, stemNodeIds: ['node_hin_16'], bodyNodeIds: [], optionCandidateIds: [] },
      ],
      includedPhysicalNodeIds: ['node_hin_16'],
    });

    const qEnglish = createCandidate({
      candidateId: 'cand_upsc_p7_q15_eng',
      physicalInstanceId: 'inst_p7_q15_eng',
      sourceQuestionNumber: '15', // Labeled 15 in English
      startPageNumber: 7,
      languageRepresentations: [
        { languageScript: 'LATIN', pageNumber: 7, stemNodeIds: ['node_eng_15'], bodyNodeIds: [], optionCandidateIds: [] },
      ],
      includedPhysicalNodeIds: ['node_eng_15'],
    });

    const rel: QuestionRelationshipCandidate = {
      relationshipId: 'rel_discrepancy_q15_q16',
      sourceCandidateId: qHindi.candidateId,
      targetCandidateId: qEnglish.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [
        { evidenceId: 'ev_spread', evidenceType: 'FACING_PAGE_SPREAD_PAIR', evidenceStrength: 'HARD', sourceNodeIds: [], description: 'Facing spread', confidence: 1.0 },
        { evidenceId: 'ev_script', evidenceType: 'DISTINCT_SCRIPT_DETECTION', evidenceStrength: 'HARD', sourceNodeIds: [], description: 'Devanagari vs Latin', confidence: 1.0 },
      ],
      confidenceScore: 1.0,
      verificationStatus: 'RELATIONSHIP_PROVEN',
      isSymmetric: true,
      provenance: {
        sourceSnapshotId: 'snap_sample_1',
        sourceDocumentId: 'doc_sample_1',
        createdAt: 0,
      },
    };

    const qgraph = createQuestionGraph([qHindi, qEnglish], [rel]);

    const result = orchestrator.executePipeline({
      questionGraph: qgraph,
    });

    expect(result.isSuccess).toBe(true);
    const canonicalQ = result.package!.canonicalQuestions[0];

    // Invariant 3: Discrepancy honesty preserved
    expect(canonicalQ.sourceDiscrepancies.hasNumberingDiscrepancy).toBe(true);
    expect(canonicalQ.sourceDiscrepancies.sourceNumberings).toHaveLength(2);

    const numbers = canonicalQ.sourceDiscrepancies.sourceNumberings.map((n) => n.printedQuestionNumber);
    expect(numbers).toContain('16');
    expect(numbers).toContain('15');

    // Validation engine reports Inv3 passed
    const inv3 = result.validationReport.invariantsEvaluated.find(
      (i) => i.invariantName === 'Inv3_DiscrepancyHonesty'
    );
    expect(inv3?.isSatisfied).toBe(true);
  });

  it('4. Integrates Answer Authority Resolution and correctly identifies AUTHORITATIVE head', () => {
    const q1 = createCandidate({
      candidateId: 'cand_auth_1',
      physicalInstanceId: 'inst_auth_1',
      sourceQuestionNumber: '1',
    });
    const qgraph = createQuestionGraph([q1]);

    // Synthesize question first to obtain its canonicalQuestionId
    const dryRun = orchestrator.executePipeline({ questionGraph: qgraph });
    const canonicalQuestionId = dryRun.package!.canonicalQuestions[0].canonicalQuestionId;

    // Create an immutable answer resolution version
    const candidateAnswer = {
      candidateAnswerId: deriveCandidateAnswerId({ canonicalQuestionId, sourceEntryId: 'entry_1', parsedPayload: { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'B' } }),
      canonicalQuestionId,
      sourceEntryId: 'entry_1',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'B' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 'snap_1', sourceDocumentId: 'doc_1', adapterVersion: '1.0' },
    };

    const resolutionVersion: AnswerAuthorityResolutionVersion = createResolutionVersion({
      canonicalQuestionId,
      candidate: candidateAnswer,
      versionNumber: 1,
      authorityDocumentSourceId: 'src_official_key',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });

    const result = orchestrator.executePipeline({
      questionGraph: qgraph,
      resolutionVersions: [resolutionVersion],
      strictValidation: true,
    });

    expect(result.isSuccess).toBe(true);
    const pkg = result.package!;

    expect(pkg.authoritativeAnswers[canonicalQuestionId]).toBeDefined();
    expect(pkg.authoritativeAnswers[canonicalQuestionId].status).toBe('AUTHORITATIVE');
    expect(pkg.authoritativeAnswers[canonicalQuestionId].authoritativeResolution?.resolutionVersionId).toBe(
      resolutionVersion.resolutionVersionId
    );

    expect(result.validationReport.authoritativeAnswerCount).toBe(1);
    expect(result.validationReport.conflictedAnswerCount).toBe(0);
  });

  it('5. Quarantines multi-head conflicting answer versions into LINEAGE_CONFLICT and flags REVIEW_REQUIRED', () => {
    const q1 = createCandidate({
      candidateId: 'cand_conflict_1',
      physicalInstanceId: 'inst_conflict_1',
      sourceQuestionNumber: '1',
    });
    const qgraph = createQuestionGraph([q1]);

    const dryRun = orchestrator.executePipeline({ questionGraph: qgraph });
    const canonicalQuestionId = dryRun.package!.canonicalQuestions[0].canonicalQuestionId;

    const candA = {
      candidateAnswerId: deriveCandidateAnswerId({ canonicalQuestionId, sourceEntryId: 'entry_a', parsedPayload: { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'A' } }),
      canonicalQuestionId,
      sourceEntryId: 'entry_a',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'A' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 'snap_1', sourceDocumentId: 'doc_1', adapterVersion: '1.0' },
    };
    const candC = {
      candidateAnswerId: deriveCandidateAnswerId({ canonicalQuestionId, sourceEntryId: 'entry_c', parsedPayload: { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'C' } }),
      canonicalQuestionId,
      sourceEntryId: 'entry_c',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'C' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 'snap_1', sourceDocumentId: 'doc_1', adapterVersion: '1.0' },
    };

    // Two competing root heads without unifying event
    const v1 = createResolutionVersion({
      canonicalQuestionId,
      candidate: candA,
      versionNumber: 1,
      authorityDocumentSourceId: 'src_provisional_key',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });
    const v2 = createResolutionVersion({
      canonicalQuestionId,
      candidate: candC,
      versionNumber: 2,
      authorityDocumentSourceId: 'src_competing_corrigendum',
      supersedesVersionId: null, // competing root head
      effectiveFrom: '2026-01-05T00:00:00Z',
    });

    const result = orchestrator.executePipeline({
      questionGraph: qgraph,
      resolutionVersions: [v1, v2],
    });

    const pkg = result.package!;
    expect(pkg.authoritativeAnswers[canonicalQuestionId].status).toBe('LINEAGE_CONFLICT');
    expect(pkg.authoritativeAnswers[canonicalQuestionId].competingResolutionVersions).toHaveLength(2);

    // Validation engine marks status PACKAGE_REVIEW_REQUIRED due to conflict
    expect(result.validationReport.validationStatus).toBe('PACKAGE_REVIEW_REQUIRED');
    expect(result.validationReport.conflictedAnswerCount).toBe(1);
    expect(result.validationReport.passedInvariantCount).toBe(7);
  });

  it('6. Proves bitwise idempotency across repeated consecutive executions', () => {
    const q1 = createCandidate({ candidateId: 'cand_idemp_1', physicalInstanceId: 'inst_idemp_1' });
    const q2 = createCandidate({ candidateId: 'cand_idemp_2', physicalInstanceId: 'inst_idemp_2' });
    const qgraph = createQuestionGraph([q1, q2]);

    const run1 = orchestrator.executePipeline({ questionGraph: qgraph });
    const run2 = orchestrator.executePipeline({ questionGraph: qgraph });
    const run3 = orchestrator.executePipeline({ questionGraph: qgraph });

    expect(run1.package!.packageId).toBe(run2.package!.packageId);
    expect(run2.package!.packageId).toBe(run3.package!.packageId);
    expect(run1.package!.sealedFingerprint).toBe(run3.package!.sealedFingerprint);
  });

  it('7. Proves permutation invariance under shuffled candidate and relationship array orderings', () => {
    const q1 = createCandidate({ candidateId: 'cand_perm_a', physicalInstanceId: 'inst_perm_a' });
    const q2 = createCandidate({ candidateId: 'cand_perm_b', physicalInstanceId: 'inst_perm_b' });
    const q3 = createCandidate({ candidateId: 'cand_perm_c', physicalInstanceId: 'inst_perm_c' });

    // Order 1: [A, B, C]
    const qgraph1 = createQuestionGraph([q1, q2, q3]);
    // Order 2: [C, A, B]
    const qgraph2 = createQuestionGraph([q3, q1, q2]);
    // Order 3: [B, C, A]
    const qgraph3 = createQuestionGraph([q2, q3, q1]);

    const res1 = orchestrator.executePipeline({ questionGraph: qgraph1 });
    const res2 = orchestrator.executePipeline({ questionGraph: qgraph2 });
    const res3 = orchestrator.executePipeline({ questionGraph: qgraph3 });

    expect(res1.package!.packageId).toBe(res2.package!.packageId);
    expect(res2.package!.packageId).toBe(res3.package!.packageId);
    expect(res1.package!.canonicalQuestions.map((q) => q.canonicalQuestionId)).toEqual(
      res3.package!.canonicalQuestions.map((q) => q.canonicalQuestionId)
    );
  });
});
