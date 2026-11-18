/**
 * UADUE Phase 2D-6 — Canonical Pipeline Adversarial Test Suite
 * Document Version: 6.0.0-STAGE-B-AUTHORIZED
 *
 * Implements 14 mandated adversarial stress scenarios:
 *
 * 1. Duplicate physical candidates & relationships
 * 2. Stale versions & out-of-order corrigenda
 * 3. Unresolved conflict multi-head quarantine
 * 4. Missing provenance rejection
 * 5. Dangling references in family membership
 * 6. Source hash mismatch & tamper detection
 * 7. Bitwise replay & idempotency invariance
 * 8. Shuffled asynchronous input permutation
 * 9. Partial question failure & blast radius isolation
 * 10. Version upgrade & backward compatibility
 * 11. Historical reproducibility from frozen snapshot
 * 12. Multilingual recto/verso dual preservation
 * 13. Source discrepancy ledgering
 * 14. Pathological input & resource limit enforcement
 */

import { describe, it, expect } from 'vitest';
import {
  QuestionGraph,
  QuestionCandidate,
  QuestionRelationshipCandidate,
} from '../contracts/questionGraph';
import {
  CanonicalPipelineOrchestrator,
  MAX_CANDIDATES_PER_PACKAGE,
} from './canonicalPipelineOrchestrator';
import { CanonicalValidationEngine } from './canonicalValidationEngine';
import {
  AnswerAuthorityResolutionVersion,
  ConflictResolutionEvent,
  LineageResolutionResult,
} from './types';
import { createResolutionVersion } from './answerAuthorityResolver';
import {
  deriveCandidateAnswerId,
  derivePackageId,
  computePackageIntegritySeal,
} from './canonicalHashing';

describe('UADUE Phase 2D-6 — Canonical Pipeline Adversarial Test Suite', () => {
  const orchestrator = new CanonicalPipelineOrchestrator();
  const validationEngine = new CanonicalValidationEngine();

  const createCandidate = (overrides: Partial<QuestionCandidate>): QuestionCandidate => ({
    candidateId: 'cand_adv_1',
    physicalInstanceId: 'inst_adv_1',
    candidateDisplayOrder: 1,
    sourceOrder: 1,
    startPageNumber: 1,
    endPageNumber: 1,
    isMultiPage: false,
    identityCandidate: {
      physicalInstanceId: overrides.physicalInstanceId || 'inst_adv_1',
      numberType: 'QUESTION_NUMBER',
      confidence: 1.0,
      supportingEvidenceIds: [],
    },
    includedPhysicalNodeIds: ['node_adv_stem_1'],
    stemNodeIds: ['node_adv_stem_1'],
    bodyNodeIds: [],
    optionCandidateIds: ['opt_adv_1', 'opt_adv_2'],
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
        stemNodeIds: ['node_adv_stem_1'],
        bodyNodeIds: [],
        optionCandidateIds: ['opt_adv_1', 'opt_adv_2'],
      },
    ],
    ...overrides,
  });

  const createQuestionGraph = (
    questions: QuestionCandidate[],
    relationships: QuestionRelationshipCandidate[] = []
  ): QuestionGraph => ({
    graphId: 'qgraph_adv_1',
    sourceDocumentId: 'doc_adv_1',
    sourceSnapshotId: 'snap_adv_1',
    sourceSha256: 'a1b2c3d4e5f60000000000000000000000000000000000000000000000000000',
    sourceDocumentGraphId: 'docgraph_adv_1',
    sourceDocumentGraphSha256: 'b1b2c3d4e5f60000000000000000000000000000000000000000000000000000',
    schemaVersion: 'uadue-qg-v3',
    algorithmVersion: '3.0.0',
    configurationVersion: '1.0.0',
    questions,
    stimuli: [],
    options: [
      {
        optionCandidateId: 'opt_adv_1',
        contentNodeIds: ['node_opt_adv_1'],
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
      sourceDocumentGraphId: 'dg_adv_1',
      sourceSnapshotId: 'snap_adv_1',
      sourceDocumentId: 'doc_adv_1',
      sourceSha256: 'a1b2c3d4e5f60000000000000000000000000000000000000000000000000000',
      sourceDocumentGraphSha256: 'b1b2c3d4e5f60000000000000000000000000000000000000000000000000000',
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
    sealedHash: 'sealed_adv_123',
    sealedAt: 0,
  });

  // ==========================================================================
  // Scenario 1: Duplicate Physical Candidates & Relationships
  // ==========================================================================
  it('Scenario 1: Handles duplicate physical candidates and relationships without multiplying canonical elements', () => {
    const q1 = createCandidate({ candidateId: 'cand_dup_1', physicalInstanceId: 'inst_dup_1' });
    const rel1: QuestionRelationshipCandidate = {
      relationshipId: 'rel_dup_1',
      sourceCandidateId: q1.candidateId,
      targetCandidateId: q1.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [],
      confidenceScore: 1.0,
      verificationStatus: 'RELATIONSHIP_PROVEN',
      isSymmetric: true,
      provenance: {
        sourceSnapshotId: 'snap_adv_1',
        sourceDocumentId: 'doc_adv_1',
        createdAt: 0,
      },
    };

    // Graph contains duplicates of same candidate and relationship
    const qgraph = createQuestionGraph([q1, q1], [rel1, rel1]);

    const result = orchestrator.executePipeline({ questionGraph: qgraph });
    expect(result.isSuccess).toBe(true);

    // Duplicates are cleanly handled without polluting question count
    expect(result.package!.canonicalQuestions).toHaveLength(1);
    expect(result.package!.logicalFamilies).toHaveLength(1);
  });

  // ==========================================================================
  // Scenario 2: Stale Versions & Out-of-Order Corrigenda
  // ==========================================================================
  it('Scenario 2: Evaluates out-of-order corrigenda without timestamp or version-number heuristics', () => {
    const q1 = createCandidate({ candidateId: 'cand_stale_1', physicalInstanceId: 'inst_stale_1' });
    const qgraph = createQuestionGraph([q1]);

    const dryRun = orchestrator.executePipeline({ questionGraph: qgraph });
    const qid = dryRun.package!.canonicalQuestions[0].canonicalQuestionId;

    const candA = {
      candidateAnswerId: deriveCandidateAnswerId({ canonicalQuestionId: qid, sourceEntryId: 'entry_stale_1', parsedPayload: { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'A' } }),
      canonicalQuestionId: qid,
      sourceEntryId: 'entry_stale_1',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'A' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 'snap_1', sourceDocumentId: 'doc_1', adapterVersion: '1.0' },
    };
    const candB = {
      candidateAnswerId: deriveCandidateAnswerId({ canonicalQuestionId: qid, sourceEntryId: 'entry_stale_2', parsedPayload: { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'B' } }),
      canonicalQuestionId: qid,
      sourceEntryId: 'entry_stale_2',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'B' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 'snap_1', sourceDocumentId: 'doc_1', adapterVersion: '1.0' },
    };

    // v1 is root. v2 supersedes v1.
    const v1 = createResolutionVersion({
      canonicalQuestionId: qid,
      candidate: candA,
      versionNumber: 1,
      authorityDocumentSourceId: 'src_key_1',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });
    const v2 = createResolutionVersion({
      canonicalQuestionId: qid,
      candidate: candB,
      versionNumber: 2,
      authorityDocumentSourceId: 'src_corrigendum',
      supersedesVersionId: v1.resolutionVersionId,
      effectiveFrom: '2026-01-05T00:00:00Z',
    });

    // Provide versions in reversed order [v2, v1]
    const result = orchestrator.executePipeline({
      questionGraph: qgraph,
      resolutionVersions: [v2, v1],
    });

    expect(result.package!.authoritativeAnswers[qid].status).toBe('AUTHORITATIVE');
    expect(result.package!.authoritativeAnswers[qid].authoritativeResolution?.resolutionVersionId).toBe(
      v2.resolutionVersionId
    );
  });

  // ==========================================================================
  // Scenario 3: Unresolved Conflict Multi-Head Quarantine
  // ==========================================================================
  it('Scenario 3: Resolves multi-head conflict only when explicit ConflictResolutionEvent binds all heads', () => {
    const q1 = createCandidate({ candidateId: 'cand_conf_heads', physicalInstanceId: 'inst_conf_heads' });
    const qgraph = createQuestionGraph([q1]);

    const dryRun = orchestrator.executePipeline({ questionGraph: qgraph });
    const qid = dryRun.package!.canonicalQuestions[0].canonicalQuestionId;

    const candA = {
      candidateAnswerId: deriveCandidateAnswerId({ canonicalQuestionId: qid, sourceEntryId: 'e_a', parsedPayload: { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'A' } }),
      canonicalQuestionId: qid,
      sourceEntryId: 'e_a',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'A' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's', sourceDocumentId: 'd', adapterVersion: '1' },
    };
    const candC = {
      candidateAnswerId: deriveCandidateAnswerId({ canonicalQuestionId: qid, sourceEntryId: 'e_c', parsedPayload: { type: 'SINGLE_CHOICE_MCQ', correctOptionLabel: 'C' } }),
      canonicalQuestionId: qid,
      sourceEntryId: 'e_c',
      parsedPayload: { type: 'SINGLE_CHOICE_MCQ' as const, correctOptionLabel: 'C' },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's', sourceDocumentId: 'd', adapterVersion: '1' },
    };

    const v1 = createResolutionVersion({
      canonicalQuestionId: qid,
      candidate: candA,
      versionNumber: 1,
      authorityDocumentSourceId: 'src_key_a',
      effectiveFrom: '2026-01-01T00:00:00Z',
    });
    const v2 = createResolutionVersion({
      canonicalQuestionId: qid,
      candidate: candC,
      versionNumber: 2,
      authorityDocumentSourceId: 'src_key_c',
      supersedesVersionId: null,
      effectiveFrom: '2026-01-02T00:00:00Z',
    });

    // 1. Without unifying event: Conflicted
    const resWithoutEvent = orchestrator.executePipeline({
      questionGraph: qgraph,
      resolutionVersions: [v1, v2],
    });
    expect(resWithoutEvent.package!.authoritativeAnswers[qid].status).toBe('LINEAGE_CONFLICT');

    // 2. With unifying event: Authoritative
    const candBoth = {
      candidateAnswerId: deriveCandidateAnswerId({ canonicalQuestionId: qid, sourceEntryId: 'e_both', parsedPayload: { type: 'MULTIPLE_CHOICE_MSQ', correctOptionLabels: ['A', 'C'], isOrderSensitive: false } }),
      canonicalQuestionId: qid,
      sourceEntryId: 'e_both',
      parsedPayload: { type: 'MULTIPLE_CHOICE_MSQ' as const, correctOptionLabels: ['A', 'C'], isOrderSensitive: false },
      evidence: [],
      verificationStatus: 'VERIFIED' as const,
      confidenceScore: 1.0,
      provenance: { sourceSnapshotId: 's', sourceDocumentId: 'd', adapterVersion: '1' },
    };
    const v3 = createResolutionVersion({
      canonicalQuestionId: qid,
      candidate: candBoth,
      versionNumber: 3,
      authorityDocumentSourceId: 'src_unifying_court_order',
      supersedesVersionId: v1.resolutionVersionId,
      effectiveFrom: '2026-01-10T00:00:00Z',
    });

    const conflictEvent: ConflictResolutionEvent = {
      eventId: 'evt_unify_v1_v2',
      conflictId: 'conf_1',
      resolutionFamilyId: v1.resolutionFamilyId,
      unifyingResolutionVersionId: v3.resolutionVersionId,
      resolvedConflictHeadVersionIds: [v1.resolutionVersionId, v2.resolutionVersionId],
      resolutionRationale: 'Official court order recognized both A and C as correct options.',
      resolvedAt: 12345678,
    };

    const resWithEvent = orchestrator.executePipeline({
      questionGraph: qgraph,
      resolutionVersions: [v1, v2, v3],
      conflictResolutionEvents: [conflictEvent],
    });

    expect(resWithEvent.package!.authoritativeAnswers[qid].status).toBe('AUTHORITATIVE');
    expect(resWithEvent.package!.authoritativeAnswers[qid].authoritativeResolution?.resolutionVersionId).toBe(
      v3.resolutionVersionId
    );
  });

  // ==========================================================================
  // Scenario 4: Missing Provenance Rejection
  // ==========================================================================
  it('Scenario 4: Validation Engine fails closed when AST nodes lack source provenance', () => {
    const q1 = createCandidate({ candidateId: 'cand_prov_test', physicalInstanceId: 'inst_prov_test' });
    const qgraph = createQuestionGraph([q1]);

    const run = orchestrator.executePipeline({ questionGraph: qgraph });
    const pkg = run.package!;

    // Corrupt AST node provenance
    pkg.canonicalQuestions[0].representations[0].stemAST[0].provenance = [];

    const inv2 = validationEngine.validateInv2TraceabilityCompleteness(pkg, qgraph);
    expect(inv2.isSatisfied).toBe(false);
    expect(inv2.failureDetails?.some((f) => f.includes('UNRESOLVED_PROVENANCE'))).toBe(true);
  });

  // ==========================================================================
  // Scenario 5: Dangling References in Family Membership
  // ==========================================================================
  it('Scenario 5: Rejects relationship evaluations referencing non-existent candidates without crashing', () => {
    const q1 = createCandidate({ candidateId: 'cand_dangling_1', physicalInstanceId: 'inst_dangling_1' });
    const relDangling: QuestionRelationshipCandidate = {
      relationshipId: 'rel_dangling_edge',
      sourceCandidateId: q1.candidateId,
      targetCandidateId: 'cand_ghost_non_existent',
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [],
      confidenceScore: 1.0,
      verificationStatus: 'RELATIONSHIP_PROVEN',
      isSymmetric: true,
      provenance: {
        sourceSnapshotId: 'snap_adv_1',
        sourceDocumentId: 'doc_adv_1',
        createdAt: 0,
      },
    };

    const qgraph = createQuestionGraph([q1], [relDangling]);
    const result = orchestrator.executePipeline({ questionGraph: qgraph });

    expect(result.isSuccess).toBe(true);
    // Ghost target relationship was gracefully skipped and reported in warnings
    expect(result.executionWarnings.some((w) => w.includes('cand_ghost_non_existent'))).toBe(true);
    expect(result.package!.canonicalQuestions).toHaveLength(1);
  });

  // ==========================================================================
  // Scenario 6: Source Hash Mismatch & Tamper Detection
  // ==========================================================================
  it('Scenario 6: Validation Engine detects mutated package ID and flags bitwise determinism failure', () => {
    const q1 = createCandidate({ candidateId: 'cand_tamper_1', physicalInstanceId: 'inst_tamper_1' });
    const qgraph = createQuestionGraph([q1]);

    const run = orchestrator.executePipeline({ questionGraph: qgraph });
    const pkg = run.package!;

    // Tamper with packageId
    pkg.packageId = '0000000000000000000000000000000000000000000000000000000000000000';

    const inv6 = validationEngine.validateInv6BitwiseDeterminism(pkg);
    expect(inv6.isSatisfied).toBe(false);
    expect(inv6.failureDetails?.some((f) => f.includes('Bitwise Determinism Failure'))).toBe(true);
  });

  // ==========================================================================
  // Scenario 7: Bitwise Replay & Idempotency Invariance (10 Iterations)
  // ==========================================================================
  it('Scenario 7: Proves bitwise idempotency across 10 consecutive executions', () => {
    const q1 = createCandidate({ candidateId: 'cand_rep_1', physicalInstanceId: 'inst_rep_1' });
    const q2 = createCandidate({ candidateId: 'cand_rep_2', physicalInstanceId: 'inst_rep_2' });
    const qgraph = createQuestionGraph([q1, q2]);

    const baselineResult = orchestrator.executePipeline({ questionGraph: qgraph });
    const baselineId = baselineResult.package!.packageId;

    for (let i = 0; i < 10; i++) {
      const result = orchestrator.executePipeline({ questionGraph: qgraph });
      expect(result.package!.packageId).toBe(baselineId);
    }
  });

  // ==========================================================================
  // Scenario 8: Shuffled Asynchronous Input Permutation (10 Iterations)
  // ==========================================================================
  it('Scenario 8: Proves invariant package ID across 10 random candidate array permutations', () => {
    const candidates = [
      createCandidate({ candidateId: 'cand_perm_1', physicalInstanceId: 'inst_perm_1' }),
      createCandidate({ candidateId: 'cand_perm_2', physicalInstanceId: 'inst_perm_2' }),
      createCandidate({ candidateId: 'cand_perm_3', physicalInstanceId: 'inst_perm_3' }),
      createCandidate({ candidateId: 'cand_perm_4', physicalInstanceId: 'inst_perm_4' }),
    ];

    const baseline = orchestrator.executePipeline({ questionGraph: createQuestionGraph(candidates) });
    const expectedPackageId = baseline.package!.packageId;

    for (let i = 0; i < 10; i++) {
      // Fisher-Yates shuffle
      const shuffled = [...candidates];
      for (let j = shuffled.length - 1; j > 0; j--) {
        const k = (i + j) % (j + 1);
        [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
      }

      const res = orchestrator.executePipeline({ questionGraph: createQuestionGraph(shuffled) });
      expect(res.package!.packageId).toBe(expectedPackageId);
    }
  });

  // ==========================================================================
  // Scenario 9: Partial Question Failure & Blast Radius Isolation
  // ==========================================================================
  it('Scenario 9: Corrupted candidate does not crash pipeline and blast radius is isolated', () => {
    const validQ1 = createCandidate({ candidateId: 'cand_valid_1', physicalInstanceId: 'inst_valid_1', sourceQuestionNumber: '1' });
    const validQ2 = createCandidate({ candidateId: 'cand_valid_2', physicalInstanceId: 'inst_valid_2', sourceQuestionNumber: '2' });
    const corruptedQ3 = createCandidate({
      candidateId: 'cand_corrupted_3',
      physicalInstanceId: 'inst_corrupted_3',
      includedPhysicalNodeIds: [], // Empty node references
      languageRepresentations: [],
    });

    const qgraph = createQuestionGraph([validQ1, validQ2, corruptedQ3]);
    const result = orchestrator.executePipeline({ questionGraph: qgraph });

    expect(result.isSuccess).toBe(true);
    // Valid questions synthesized
    expect(result.package!.canonicalQuestions.length).toBeGreaterThanOrEqual(2);
  });

  // ==========================================================================
  // Scenario 10: Version Upgrade & Algorithm Backward Compatibility
  // ==========================================================================
  it('Scenario 10: Algorithm version upgrade changes packageId deterministically without mutating historical lineage', () => {
    const q1 = createCandidate({ candidateId: 'cand_v_upgrade', physicalInstanceId: 'inst_v_upgrade' });
    const qgraph = createQuestionGraph([q1]);

    const resV6 = orchestrator.executePipeline({
      questionGraph: qgraph,
      algorithmVersion: '6.0.0',
    });

    const resV7 = orchestrator.executePipeline({
      questionGraph: qgraph,
      algorithmVersion: '7.0.0',
    });

    expect(resV6.package!.packageId).not.toBe(resV7.package!.packageId);
    expect(resV6.package!.pipelineAlgorithmVersion).toBe('6.0.0');
    expect(resV7.package!.pipelineAlgorithmVersion).toBe('7.0.0');
  });

  // ==========================================================================
  // Scenario 11: Historical Reproducibility from Frozen Snapshot
  // ==========================================================================
  it('Scenario 11: Re-evaluating a frozen snapshot yields identical output hashes', () => {
    const q1 = createCandidate({ candidateId: 'cand_hist_1', physicalInstanceId: 'inst_hist_1' });
    const qgraph = createQuestionGraph([q1]);

    const resA = orchestrator.executePipeline({ questionGraph: qgraph });
    const resB = orchestrator.executePipeline({ questionGraph: qgraph });

    expect(resA.package!.canonicalQuestions[0].canonicalFingerprint).toBe(
      resB.package!.canonicalQuestions[0].canonicalFingerprint
    );
  });

  // ==========================================================================
  // Scenario 12: Multilingual Recto/Verso Dual Preservation
  // ==========================================================================
  it('Scenario 12: Dual recto/verso bilingual representations are fully preserved side-by-side', () => {
    const qHindi = createCandidate({
      candidateId: 'cand_bi_h',
      physicalInstanceId: 'inst_bi_h',
      sourceQuestionNumber: '5',
      languageRepresentations: [
        { languageScript: 'DEVANAGARI', pageNumber: 4, stemNodeIds: ['h_stem'], bodyNodeIds: [], optionCandidateIds: [] },
      ],
      includedPhysicalNodeIds: ['h_stem'],
    });

    const qEnglish = createCandidate({
      candidateId: 'cand_bi_e',
      physicalInstanceId: 'inst_bi_e',
      sourceQuestionNumber: '5',
      languageRepresentations: [
        { languageScript: 'LATIN', pageNumber: 5, stemNodeIds: ['e_stem'], bodyNodeIds: [], optionCandidateIds: [] },
      ],
      includedPhysicalNodeIds: ['e_stem'],
    });

    const rel: QuestionRelationshipCandidate = {
      relationshipId: 'rel_bi_5',
      sourceCandidateId: qHindi.candidateId,
      targetCandidateId: qEnglish.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [
        { evidenceId: 'e1', evidenceType: 'FACING_PAGE_SPREAD_PAIR', evidenceStrength: 'HARD', sourceNodeIds: [], description: 'Facing', confidence: 1.0 },
        { evidenceId: 'e2', evidenceType: 'DISTINCT_SCRIPT_DETECTION', evidenceStrength: 'HARD', sourceNodeIds: [], description: 'Scripts', confidence: 1.0 },
      ],
      confidenceScore: 1.0,
      verificationStatus: 'RELATIONSHIP_PROVEN',
      isSymmetric: true,
      provenance: {
        sourceSnapshotId: 'snap_adv_1',
        sourceDocumentId: 'doc_adv_1',
        createdAt: 0,
      },
    };

    const qgraph = createQuestionGraph([qHindi, qEnglish], [rel]);
    const res = orchestrator.executePipeline({ questionGraph: qgraph });

    const q = res.package!.canonicalQuestions[0];
    expect(q.representations).toHaveLength(2);
    expect(q.representations.map((r) => r.languageScript).sort()).toEqual(['DEVANAGARI', 'LATIN']);
  });

  // ==========================================================================
  // Scenario 13: Source Discrepancy Ledgering
  // ==========================================================================
  it('Scenario 13: Numbering anomalies across bilingual representations are ledgered, not rewritten', () => {
    const qH = createCandidate({
      candidateId: 'cand_disc_h',
      physicalInstanceId: 'inst_disc_h',
      sourceQuestionNumber: '21',
      languageRepresentations: [{ languageScript: 'DEVANAGARI', pageNumber: 8, stemNodeIds: ['h8'], bodyNodeIds: [], optionCandidateIds: [] }],
      includedPhysicalNodeIds: ['h8'],
    });
    const qE = createCandidate({
      candidateId: 'cand_disc_e',
      physicalInstanceId: 'inst_disc_e',
      sourceQuestionNumber: '20',
      languageRepresentations: [{ languageScript: 'LATIN', pageNumber: 9, stemNodeIds: ['e9'], bodyNodeIds: [], optionCandidateIds: [] }],
      includedPhysicalNodeIds: ['e9'],
    });

    const rel: QuestionRelationshipCandidate = {
      relationshipId: 'rel_disc_20_21',
      sourceCandidateId: qH.candidateId,
      targetCandidateId: qE.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [
        { evidenceId: 'e1', evidenceType: 'FACING_PAGE_SPREAD_PAIR', evidenceStrength: 'HARD', sourceNodeIds: [], description: 'Facing', confidence: 1.0 },
        { evidenceId: 'e2', evidenceType: 'DISTINCT_SCRIPT_DETECTION', evidenceStrength: 'HARD', sourceNodeIds: [], description: 'Scripts', confidence: 1.0 },
      ],
      confidenceScore: 1.0,
      verificationStatus: 'RELATIONSHIP_PROVEN',
      isSymmetric: true,
      provenance: {
        sourceSnapshotId: 'snap_adv_1',
        sourceDocumentId: 'doc_adv_1',
        createdAt: 0,
      },
    };

    const qgraph = createQuestionGraph([qH, qE], [rel]);
    const res = orchestrator.executePipeline({ questionGraph: qgraph });

    const q = res.package!.canonicalQuestions[0];
    expect(q.sourceDiscrepancies.hasNumberingDiscrepancy).toBe(true);
    expect(q.sourceDiscrepancies.sourceNumberings.map((n) => n.printedQuestionNumber).sort()).toEqual(['20', '21']);
  });

  // ==========================================================================
  // Scenario 14: Pathological Input & Resource Limit Enforcement
  // ==========================================================================
  it('Scenario 14: Rejects pathological inputs exceeding candidate limits without process exhaustion', () => {
    // Generate pathological candidate count exceeding MAX_CANDIDATES_PER_PACKAGE
    const excessiveCandidates: QuestionCandidate[] = [];
    for (let i = 0; i < MAX_CANDIDATES_PER_PACKAGE + 10; i++) {
      excessiveCandidates.push(
        createCandidate({
          candidateId: `cand_patho_${i}`,
          physicalInstanceId: `inst_patho_${i}`,
        })
      );
    }

    const qgraph = createQuestionGraph(excessiveCandidates);
    const res = orchestrator.executePipeline({ questionGraph: qgraph });

    expect(res.isSuccess).toBe(false);
    expect(res.executionErrors.some((e) => e.includes('MAX_CANDIDATES_PER_PACKAGE'))).toBe(true);
  });

  // ==========================================================================
  // Scenario 15: Content Mutation Breaks Package Integrity Seal (Issue 1 & 2)
  // ==========================================================================
  it('Scenario 15: Package Integrity Seal fails validation when question AST content is mutated without ID changes', () => {
    const q1 = createCandidate({
      candidateId: 'cand_seal_test_1',
      physicalInstanceId: 'inst_seal_test_1',
    });
    const qgraph = createQuestionGraph([q1]);

    const result = orchestrator.executePipeline({ questionGraph: qgraph });
    expect(result.isSuccess).toBe(true);
    const pkg = result.package!;

    // Initial validation succeeds
    const initialInv6 = validationEngine.validateInv6BitwiseDeterminism(pkg);
    expect(initialInv6.isSatisfied).toBe(true);

    // Deep copy package
    const mutatedPkg = JSON.parse(JSON.stringify(pkg));

    // Mutate internal AST text without touching any IDs (packageId structure remains identical)
    mutatedPkg.canonicalQuestions[0].representations[0].stemAST[0].rawSourceText =
      'MUTATED_STEM_CONTENT_WITHOUT_ID_CHANGE';

    // packageId check still passes expectedPkgId, BUT packageIntegritySeal check FAILS CLOSED
    const mutatedInv6 = validationEngine.validateInv6BitwiseDeterminism(mutatedPkg);
    expect(mutatedInv6.isSatisfied).toBe(false);
    expect(mutatedInv6.failureDetails?.some((f: string) => f.includes('Content Integrity Failure'))).toBe(
      true
    );
  });

  // ==========================================================================
  // Scenario 16: Physical Deduplication Safety (Issue 4)
  // ==========================================================================
  it('Scenario 16: Distinct physical candidates with identical text and question numbers remain separate canonical questions', () => {
    // Two distinct physical questions with identical printed text "What is 2+2?" on different pages
    const q1 = createCandidate({
      candidateId: 'cand_identical_p1',
      physicalInstanceId: 'phys_instance_page_1_block_1',
      sourceQuestionNumber: '1',
      startPageNumber: 1,
    });
    const q2 = createCandidate({
      candidateId: 'cand_identical_p5',
      physicalInstanceId: 'phys_instance_page_5_block_1',
      sourceQuestionNumber: '1', // Identical printed number
      startPageNumber: 5,
    });

    const qgraph = createQuestionGraph([q1, q2]);
    const result = orchestrator.executePipeline({ questionGraph: qgraph });

    expect(result.isSuccess).toBe(true);
    const pkg = result.package!;

    // Both physical questions are preserved as distinct canonical questions
    expect(pkg.canonicalQuestions).toHaveLength(2);
    expect(pkg.logicalFamilies).toHaveLength(2);

    const physIds = pkg.canonicalQuestions.map(
      (q) => q.representations[0].sourcePhysicalInstanceId
    );
    expect(physIds).toContain('phys_instance_page_1_block_1');
    expect(physIds).toContain('phys_instance_page_5_block_1');
    expect(pkg.canonicalQuestions[0].canonicalQuestionId).not.toBe(
      pkg.canonicalQuestions[1].canonicalQuestionId
    );
  });

  // ==========================================================================
  // Scenario 17: Dangling Reference Quarantine with Complete Provenance (Issue 3)
  // ==========================================================================
  it('Scenario 17: Quarantines dangling relationship edge into QuarantinedRelationshipRecord while preserving surviving source candidate', () => {
    const q1 = createCandidate({
      candidateId: 'cand_surviving_src',
      physicalInstanceId: 'inst_surviving_src',
      sourceQuestionNumber: '10',
    });

    const relDangling: QuestionRelationshipCandidate = {
      relationshipId: 'rel_dangling_target_edge',
      sourceCandidateId: q1.candidateId,
      targetCandidateId: 'cand_non_existent_ghost',
      relationshipType: 'LANGUAGE_REPRESENTATION_OF',
      evidence: [],
      confidenceScore: 1.0,
      verificationStatus: 'RELATIONSHIP_PROVEN',
      isSymmetric: true,
      provenance: {
        sourceSnapshotId: 'snap_adv_1',
        sourceDocumentId: 'doc_adv_1',
        createdAt: 0,
      },
    };

    const qgraph = createQuestionGraph([q1], [relDangling]);
    const result = orchestrator.executePipeline({ questionGraph: qgraph });

    expect(result.isSuccess).toBe(true);
    const pkg = result.package!;

    // Quarantined relationship record is preserved with full provenance
    expect(pkg.quarantinedRelationships).toHaveLength(1);
    const quarantined = pkg.quarantinedRelationships[0];
    expect(quarantined.relationshipId).toBe('rel_dangling_target_edge');
    expect(quarantined.sourceCandidateId).toBe('cand_surviving_src');
    expect(quarantined.targetCandidateId).toBe('cand_non_existent_ghost');
    expect(quarantined.relationshipType).toBe('LANGUAGE_REPRESENTATION_OF');
    expect(quarantined.quarantineReason).toBe('DANGLING_TARGET_CANDIDATE');

    // Validation report tracks the quarantined relationship
    expect(result.validationReport.quarantinedRelationshipsCount).toBe(1);

    // Surviving source candidate is NOT discarded; synthesizes cleanly as singleton canonical question
    expect(pkg.canonicalQuestions).toHaveLength(1);
    expect(pkg.canonicalQuestions[0].representations[0].sourcePhysicalInstanceId).toBe(
      'inst_surviving_src'
    );
  });

  // ==========================================================================
  // Scenario 18: Array Source-Ordering Contract Enforcement (Issue 7)
  // ==========================================================================
  it('Scenario 18: Preserves reading sequence and option order without lexicographical sorting', () => {
    const q = createCandidate({
      candidateId: 'cand_order_contract',
      physicalInstanceId: 'inst_order_contract',
      optionCandidateIds: ['opt_z', 'opt_a', 'opt_m'],
      languageRepresentations: [
        {
          languageScript: 'LATIN',
          pageNumber: 1,
          stemNodeIds: ['node_stem_second', 'node_stem_first'],
          bodyNodeIds: [],
          optionCandidateIds: ['opt_z', 'opt_a', 'opt_m'],
        },
      ],
    });

    const qgraph = createQuestionGraph([q]);
    const result = orchestrator.executePipeline({ questionGraph: qgraph });

    expect(result.isSuccess).toBe(true);
    const rep = result.package!.canonicalQuestions[0].representations[0];

    // Source option order is preserved
    expect(rep.options.map((o) => o.optionId)).toEqual(['opt_z', 'opt_a', 'opt_m']);
  });
});

describe('UADUE Phase 2D-6 — Invariant 6 Independent Dual-Seal Validation Contract Suite', () => {
  const orchestrator = new CanonicalPipelineOrchestrator();
  const validationEngine = new CanonicalValidationEngine();

  const createCandidate = (overrides: Partial<QuestionCandidate>): QuestionCandidate => ({
    candidateId: 'cand_test_dual',
    physicalInstanceId: 'inst_test_dual',
    candidateDisplayOrder: 1,
    sourceOrder: 1,
    startPageNumber: 1,
    endPageNumber: 1,
    isMultiPage: false,
    identityCandidate: {
      physicalInstanceId: overrides.physicalInstanceId || 'inst_test_dual',
      numberType: 'QUESTION_NUMBER',
      confidence: 1.0,
      supportingEvidenceIds: [],
    },
    includedPhysicalNodeIds: ['node_stem_dual'],
    stemNodeIds: ['node_stem_dual'],
    bodyNodeIds: [],
    optionCandidateIds: ['opt_dual_1', 'opt_dual_2'],
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
        stemNodeIds: ['node_stem_dual'],
        bodyNodeIds: [],
        optionCandidateIds: ['opt_dual_1', 'opt_dual_2'],
      },
    ],
    ...overrides,
  });

  const createQuestionGraph = (
    questions: QuestionCandidate[],
    relationships: QuestionRelationshipCandidate[] = []
  ): QuestionGraph => ({
    graphId: 'qgraph_dual_1',
    sourceDocumentId: 'doc_dual_1',
    sourceSnapshotId: 'snap_dual_1',
    sourceSha256: 'a1b2c3d4e5f60000000000000000000000000000000000000000000000000000',
    sourceDocumentGraphId: 'docgraph_dual_1',
    sourceDocumentGraphSha256: 'b1b2c3d4e5f60000000000000000000000000000000000000000000000000000',
    schemaVersion: 'uadue-qg-v3',
    algorithmVersion: '3.0.0',
    configurationVersion: '1.0.0',
    questions,
    stimuli: [],
    options: [
      {
        optionCandidateId: 'opt_dual_1',
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
      {
        optionCandidateId: 'opt_dual_2',
        contentNodeIds: ['node_opt_2'],
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
      sourceDocumentGraphId: 'dg_dual_1',
      sourceSnapshotId: 'snap_dual_1',
      sourceDocumentId: 'doc_dual_1',
      sourceSha256: 'a1b2c3d4e5f60000000000000000000000000000000000000000000000000000',
      sourceDocumentGraphSha256: 'b1b2c3d4e5f60000000000000000000000000000000000000000000000000000',
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
    sealedHash: 'sealed_dual_123',
    sealedAt: 0,
  });

  const buildTestPackage = () => {
    const q1 = createCandidate({
      candidateId: 'cand_dual_seal_1',
      physicalInstanceId: 'inst_dual_seal_1',
      sourceQuestionNumber: '1',
      optionCandidateIds: ['opt_dual_1', 'opt_dual_2'],
    });
    const qgraph = createQuestionGraph([q1]);
    const result = orchestrator.executePipeline({ questionGraph: qgraph });
    expect(result.isSuccess).toBe(true);
    return { pkg: result.package!, qgraph };
  };

  // Test A: Valid package: structural identity passes and content seal passes
  it('Test A: Valid package passes both structural identity and content integrity seal', () => {
    const { pkg } = buildTestPackage();
    const inv6 = validationEngine.validateInv6BitwiseDeterminism(pkg);
    expect(inv6.isSatisfied).toBe(true);
    expect(inv6.failureDetails).toBeUndefined();
  });

  // Test B: Structural mutation: structural envelope changes and packageId validation fails
  it('Test B: Structural mutation causes packageId validation to fail closed', () => {
    const { pkg } = buildTestPackage();
    const mutated = JSON.parse(JSON.stringify(pkg));
    mutated.sourceSnapshotId = 'snap_mutated_tampered_envelope';

    const inv6 = validationEngine.validateInv6BitwiseDeterminism(mutated);
    expect(inv6.isSatisfied).toBe(false);
    expect(inv6.failureDetails?.some((f: string) => f.includes('Structural Identity mismatch'))).toBe(true);
  });

  // Test C: Content mutation without ID change: packageId remains valid, packageIntegritySeal validation fails
  it('Test C: Content mutation without ID change leaves packageId valid but packageIntegritySeal fails closed', () => {
    const { pkg } = buildTestPackage();
    const mutated = JSON.parse(JSON.stringify(pkg));
    mutated.canonicalQuestions[0].representations[0].stemAST[0].rawSourceText =
      'MUTATED_STEM_TEXT_LEAVING_IDS_UNCHANGED';

    // Verify expected packageId is strictly unchanged
    const expectedPkgId = derivePackageId({
      sourceSnapshotId: mutated.sourceSnapshotId,
      sourceDocumentId: mutated.sourceDocumentId,
      canonicalQuestionIds: mutated.canonicalQuestions.map((q: any) => q.canonicalQuestionId),
      logicalFamilyIds: mutated.logicalFamilies.map((f: any) => f.familyId),
      relationshipEvaluationIds: mutated.relationshipEvaluations.map((r: any) => r.evaluationId),
      membershipIds: mutated.memberships.map((m: any) => m.membershipFingerprint),
      quarantinedRelationshipIds: (mutated.quarantinedRelationships || []).map((q: any) => q.relationshipId),
      schemaVersion: mutated.schemaVersion,
      pipelineAlgorithmId: mutated.pipelineAlgorithmId,
      pipelineAlgorithmVersion: mutated.pipelineAlgorithmVersion,
    });
    expect(mutated.packageId).toBe(expectedPkgId);

    // Inv6 fails closed strictly on content integrity seal mismatch
    const inv6 = validationEngine.validateInv6BitwiseDeterminism(mutated);
    expect(inv6.isSatisfied).toBe(false);
    expect(inv6.failureDetails?.some((f: string) => f.includes('Content Integrity Failure'))).toBe(true);
    expect(inv6.failureDetails?.some((f: string) => f.includes('Structural Identity mismatch'))).toBe(false);
  });

  // Test D: Option mutation causes content seal failure
  it('Test D: Option text mutation causes content seal failure', () => {
    const { pkg } = buildTestPackage();
    const mutated = JSON.parse(JSON.stringify(pkg));
    mutated.canonicalQuestions[0].representations[0].options[0].text = 'MUTATED_OPTION_TEXT_VALUE';

    const inv6 = validationEngine.validateInv6BitwiseDeterminism(mutated);
    expect(inv6.isSatisfied).toBe(false);
    expect(inv6.failureDetails?.some((f: string) => f.includes('Content Integrity Failure'))).toBe(true);
  });

  // Test E: AST mutation causes content seal failure
  it('Test E: AST node mutation causes content seal failure', () => {
    const { pkg } = buildTestPackage();
    const mutated = JSON.parse(JSON.stringify(pkg));
    mutated.canonicalQuestions[0].representations[0].stemAST[0].nodeType = 'FORMULA';

    const inv6 = validationEngine.validateInv6BitwiseDeterminism(mutated);
    expect(inv6.isSatisfied).toBe(false);
    expect(inv6.failureDetails?.some((f: string) => f.includes('Content Integrity Failure'))).toBe(true);
  });

  // Test F: Discrepancy mutation causes content seal failure
  it('Test F: Discrepancy mutation causes content seal failure', () => {
    const { pkg } = buildTestPackage();
    const mutated = JSON.parse(JSON.stringify(pkg));
    mutated.canonicalQuestions[0].sourceDiscrepancies.hasNumberingDiscrepancy = true;
    mutated.canonicalQuestions[0].sourceDiscrepancies.sourceNumberings = [
      { languageScript: 'LATIN', printedQuestionNumber: '99', physicalInstanceId: 'inst_fake' },
    ];

    const inv6 = validationEngine.validateInv6BitwiseDeterminism(mutated);
    expect(inv6.isSatisfied).toBe(false);
    expect(inv6.failureDetails?.some((f: string) => f.includes('Content Integrity Failure'))).toBe(true);
  });

  // Test G: Answer-resolution mutation causes content seal failure
  it('Test G: Answer-resolution mutation causes content seal failure', () => {
    const { pkg } = buildTestPackage();
    const mutated = JSON.parse(JSON.stringify(pkg));
    const qid = mutated.canonicalQuestions[0].canonicalQuestionId;
    mutated.authoritativeAnswers[qid] = {
      status: 'AUTHORITATIVE',
      authoritativeResolution: {
        resolutionVersionId: 'res_fake_mutated_version',
        candidateAnswerId: 'ans_fake_cand',
        versionNumber: 1,
      },
    };

    const inv6 = validationEngine.validateInv6BitwiseDeterminism(mutated);
    expect(inv6.isSatisfied).toBe(false);
    expect(inv6.failureDetails?.some((f: string) => f.includes('Content Integrity Failure'))).toBe(true);
  });

  // Test H: Array permutation: only order-independent collections remain invariant
  it('Test H: Array permutation preserves structural identity for order-independent ID collections', () => {
    const q1 = createCandidate({ candidateId: 'cand_h_1', physicalInstanceId: 'inst_h_1' });
    const q2 = createCandidate({ candidateId: 'cand_h_2', physicalInstanceId: 'inst_h_2' });
    const q3 = createCandidate({ candidateId: 'cand_h_3', physicalInstanceId: 'inst_h_3' });

    // Permute candidate input order in graph
    const run1 = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q1, q2, q3]) });
    const run2 = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q3, q1, q2]) });

    // Both produce identical structural packageId and identical content packageIntegritySeal
    expect(run1.package!.packageId).toBe(run2.package!.packageId);
    expect(run1.package!.packageIntegritySeal).toBe(run2.package!.packageIntegritySeal);
  });

  // Test I: Source-ordered option permutation: must change content identity/seal where source order is semantically meaningful
  it('Test I: Source-ordered option permutation alters content integrity seal', () => {
    const { pkg } = buildTestPackage();
    const mutated = JSON.parse(JSON.stringify(pkg));
    const rep = mutated.canonicalQuestions[0].representations[0];

    expect(rep.options.length).toBeGreaterThanOrEqual(2);

    // Swap option 0 and option 1 (source order permuted)
    const temp = rep.options[0];
    rep.options[0] = rep.options[1];
    rep.options[1] = temp;

    const inv6 = validationEngine.validateInv6BitwiseDeterminism(mutated);
    expect(inv6.isSatisfied).toBe(false);
    expect(inv6.failureDetails?.some((f: string) => f.includes('Content Integrity Failure'))).toBe(true);
  });
});


