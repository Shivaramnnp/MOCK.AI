/**
 * UADUE Phase 2D-7 — Roundtrip, Lifecycle FSM & Projection Gate Verification Suite
 * Document Version: 7.3.1-CONSISTENCY-ALIGNED
 *
 * Enforces:
 * - Gate G9: Independent recomputation of packageId & packageIntegritySeal on reconstruction.
 * - Gate G10: Source-order preservation verified against deliberately shuffled database rows.
 * - Lifecycle FSM & Option A: Validation failure quarantine is irreversible (superseded only).
 * - Administrative hold quarantine is reversible.
 * - Multilingual representation ordering purity (zero primary language bias).
 * - 4-Tier Projection air-gap (zero answers in Student Live).
 * - Tenancy RLS query isolation.
 * - Content-addressed asset storage & global deduplication.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CanonicalPipelineOrchestrator } from './canonicalPipelineOrchestrator';
import {
  CanonicalPersistenceAdapter,
  PersistenceIntegrityError,
  TenancyAccessError,
} from './canonicalPersistenceAdapter';
import { CanonicalProjectionGateway } from './canonicalProjectionGateway';
import { CanonicalAssetRegistry, AssetIntegrityError } from './canonicalAssetRegistry';
import { reducePackageLifecycle, CorruptedEventStreamError } from './canonicalLifecycleEngine';
import { derivePackageId, computePackageIntegritySeal } from './canonicalHashing';
import { QuestionCandidate, QuestionGraph } from '../contracts/questionGraph';

describe('UADUE Phase 2D-7 — Roundtrip, Lifecycle & Projection Verification Suite', () => {
  let orchestrator: CanonicalPipelineOrchestrator;
  let adapter: CanonicalPersistenceAdapter;
  let projectionGateway: CanonicalProjectionGateway;
  let assetRegistry: CanonicalAssetRegistry;

  const createCandidate = (overrides: Partial<QuestionCandidate>): QuestionCandidate => ({
    candidateId: overrides.candidateId || 'cand_1',
    physicalInstanceId: overrides.physicalInstanceId || 'inst_1',
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
    optionCandidateIds: ['opt_1', 'opt_2'],
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
        pageNumber: 1,
        stemNodeIds: ['node_stem_1'],
        bodyNodeIds: [],
        optionCandidateIds: ['opt_1', 'opt_2'],
      },
      {
        languageScript: 'LATIN',
        pageNumber: 2,
        stemNodeIds: ['node_stem_2'],
        bodyNodeIds: [],
        optionCandidateIds: ['opt_1', 'opt_2'],
      },
    ],
    ...overrides,
  });

  const createQuestionGraph = (
    questions: QuestionCandidate[],
    relationships: any[] = []
  ): QuestionGraph => ({
    graphId: 'qgraph_roundtrip_test',
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
      {
        optionCandidateId: 'opt_2',
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
    sealedHash: 'sealed_graph',
    sealedAt: 0,
  });

  beforeEach(() => {
    orchestrator = new CanonicalPipelineOrchestrator();
    adapter = new CanonicalPersistenceAdapter();
    projectionGateway = new CanonicalProjectionGateway(adapter);
    assetRegistry = new CanonicalAssetRegistry();
  });

  it('1. Gate G9: Reconstructs package and independently proves bit-for-bit packageId and packageIntegritySeal parity', async () => {
    const q1 = createCandidate({ candidateId: 'c1', physicalInstanceId: 'inst1', sourceQuestionNumber: '1' });
    const qgraph = createQuestionGraph([q1]);
    const pkg = orchestrator.executePipeline({ questionGraph: qgraph, strictValidation: true }).package!;

    await adapter.persistPackage(pkg);

    // Reconstruct package
    const reconstructed = await adapter.reconstructPackage(pkg.packageId);

    // Independently re-derive packageId and packageIntegritySeal
    const independentlyDerivedId = derivePackageId({
      sourceSnapshotId: reconstructed.sourceSnapshotId,
      sourceDocumentId: reconstructed.sourceDocumentId,
      canonicalQuestionIds: reconstructed.canonicalQuestions.map((q) => q.canonicalQuestionId),
      logicalFamilyIds: reconstructed.logicalFamilies.map((f) => f.familyId),
      relationshipEvaluationIds: reconstructed.relationshipEvaluations.map((e) => e.evaluationId),
      membershipIds: reconstructed.memberships.map((m) => m.membershipFingerprint),
      quarantinedRelationshipIds: reconstructed.quarantinedRelationships.map((r) => r.relationshipId),
      schemaVersion: reconstructed.schemaVersion,
      pipelineAlgorithmId: reconstructed.pipelineAlgorithmId,
      pipelineAlgorithmVersion: reconstructed.pipelineAlgorithmVersion,
    });

    const independentlyDerivedSeal = computePackageIntegritySeal({
      packageId: reconstructed.packageId,
      sourceSnapshotId: reconstructed.sourceSnapshotId,
      sourceDocumentId: reconstructed.sourceDocumentId,
      canonicalQuestions: reconstructed.canonicalQuestions,
      logicalFamilies: reconstructed.logicalFamilies,
      relationshipEvaluations: reconstructed.relationshipEvaluations,
      memberships: reconstructed.memberships,
      quarantinedRelationships: reconstructed.quarantinedRelationships,
      authoritativeAnswers: reconstructed.authoritativeAnswers,
      schemaVersion: reconstructed.schemaVersion,
      pipelineAlgorithmId: reconstructed.pipelineAlgorithmId,
      pipelineAlgorithmVersion: reconstructed.pipelineAlgorithmVersion,
    });

    expect(independentlyDerivedId).toBe(pkg.packageId);
    expect(independentlyDerivedSeal).toBe(pkg.packageIntegritySeal);
    expect(reconstructed.packageId).toBe(pkg.packageId);
    expect(reconstructed.packageIntegritySeal).toBe(pkg.packageIntegritySeal);
  });

  it('2. Gate G10: Deliberately shuffles persisted database rows and proves reconstruction restores authentic source order', async () => {
    const q1 = createCandidate({ candidateId: 'c1', physicalInstanceId: 'inst1', sourceQuestionNumber: '1' });
    const q2 = createCandidate({ candidateId: 'c2', physicalInstanceId: 'inst2', sourceQuestionNumber: '2' });
    const q3 = createCandidate({ candidateId: 'c3', physicalInstanceId: 'inst3', sourceQuestionNumber: '3' });
    const qgraph = createQuestionGraph([q1, q2, q3]);
    const pkg = orchestrator.executePipeline({ questionGraph: qgraph, strictValidation: true }).package!;

    await adapter.persistPackage(pkg);

    // Tamper by deliberately reversing/shuffling all stored relational child rows in the database
    adapter.tamperShuffleChildRows(pkg.packageId);

    // Reconstruct package: must use ORDER BY question_index ASC
    const reconstructed = await adapter.reconstructPackage(pkg.packageId);

    // Verify questions are restored in authentic 0, 1, 2 sequence exactly matching pkg.canonicalQuestions
    expect(reconstructed.canonicalQuestions.length).toBe(3);
    pkg.canonicalQuestions.forEach((expectedQ, idx) => {
      expect(reconstructed.canonicalQuestions[idx].canonicalQuestionId).toBe(expectedQ.canonicalQuestionId);
      expect(reconstructed.canonicalQuestions[idx].logicalFamilyId).toBe(expectedQ.logicalFamilyId);
    });

    // Dual-seal recomputation passes despite raw table permutation
    const derivedSeal = computePackageIntegritySeal({
      packageId: reconstructed.packageId,
      sourceSnapshotId: reconstructed.sourceSnapshotId,
      sourceDocumentId: reconstructed.sourceDocumentId,
      canonicalQuestions: reconstructed.canonicalQuestions,
      logicalFamilies: reconstructed.logicalFamilies,
      relationshipEvaluations: reconstructed.relationshipEvaluations,
      memberships: reconstructed.memberships,
      quarantinedRelationships: reconstructed.quarantinedRelationships,
      authoritativeAnswers: reconstructed.authoritativeAnswers,
      schemaVersion: reconstructed.schemaVersion,
      pipelineAlgorithmId: reconstructed.pipelineAlgorithmId,
      pipelineAlgorithmVersion: reconstructed.pipelineAlgorithmVersion,
    });
    expect(derivedSeal).toBe(pkg.packageIntegritySeal);
  });

  it('3. Multilingual Purity: representation_index preserves upstream order without language hierarchy', async () => {
    const qHindi = createCandidate({
      candidateId: 'cand_upsc_p2_q1_hin',
      physicalInstanceId: 'inst_p2_q1_hin',
      sourceQuestionNumber: '1',
      startPageNumber: 2,
      languageRepresentations: [
        { languageScript: 'DEVANAGARI', pageNumber: 2, stemNodeIds: ['node_stem_1'], bodyNodeIds: [], optionCandidateIds: ['opt_1', 'opt_2'] },
      ],
      includedPhysicalNodeIds: ['node_stem_1'],
    });

    const qEnglish = createCandidate({
      candidateId: 'cand_upsc_p3_q1_eng',
      physicalInstanceId: 'inst_p3_q1_eng',
      sourceQuestionNumber: '1',
      startPageNumber: 3,
      languageRepresentations: [
        { languageScript: 'LATIN', pageNumber: 3, stemNodeIds: ['node_stem_1'], bodyNodeIds: [], optionCandidateIds: ['opt_1', 'opt_2'] },
      ],
      includedPhysicalNodeIds: ['node_stem_1'],
    });

    const rel = {
      relationshipId: 'rel_facing_q1',
      sourceCandidateId: qHindi.candidateId,
      targetCandidateId: qEnglish.candidateId,
      relationshipType: 'LANGUAGE_REPRESENTATION_OF' as const,
      evidence: [
        { evidenceId: 'ev_spread', evidenceType: 'FACING_PAGE_SPREAD_PAIR' as const, evidenceStrength: 'HARD' as const, sourceNodeIds: [], description: 'Facing spread', confidence: 1.0 },
      ],
      confidence: 1.0,
      verificationStatus: 'SUPPORTED' as const,
      decisionLog: [],
    };

    const qgraph = createQuestionGraph([qHindi, qEnglish], [rel]);
    const pkg = orchestrator.executePipeline({ questionGraph: qgraph, strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    const reconstructed = await adapter.reconstructPackage(pkg.packageId);
    expect(reconstructed.canonicalQuestions.length).toBe(1);
    const representations = reconstructed.canonicalQuestions[0].representations;

    // Upstream representation_index preserved verbatim
    expect(representations.length).toBe(2);
    expect(representations[0].languageScript).toBe(pkg.canonicalQuestions[0].representations[0].languageScript);
    expect(representations[1].languageScript).toBe(pkg.canonicalQuestions[0].representations[1].languageScript);
  });

  it('4. Lifecycle FSM & Option A: Validation-failure quarantine is strictly irreversible', async () => {
    const q1 = createCandidate({ candidateId: 'c_fail', physicalInstanceId: 'inst_fail' });
    const qgraph = createQuestionGraph([q1]);
    const pkg = orchestrator.executePipeline({ questionGraph: qgraph, strictValidation: true }).package!;

    // Create a package that simulated invariant failure
    pkg.validationReport.validationStatus = 'PACKAGE_FAILED';
    pkg.validationReport.failedInvariantCount = 1;

    // Persist package
    await adapter.persistPackage(pkg);

    // Derived state is QUARANTINED (origin = PERSISTED)
    expect(adapter.getPackageLifecycleState(pkg.packageId)).toBe('QUARANTINED');

    // Attempting to release validation failure quarantine must fail closed under Option A
    await expect(
      adapter.appendLifecycleEvent(pkg.packageId, 'QUARANTINE_RELEASED', {})
    ).rejects.toThrow();

    // But it can be legally superseded by a successor package
    const qSuccessor = createCandidate({ candidateId: 'c_fix', physicalInstanceId: 'inst_fix' });
    const successorGraph = createQuestionGraph([qSuccessor]);
    const successorPkg = orchestrator.executePipeline({ questionGraph: successorGraph, strictValidation: true }).package!;
    await adapter.persistPackage(successorPkg);

    await adapter.registerSupersession(pkg.packageId, successorPkg.packageId, 'Corrigendum patch');
    expect(adapter.getPackageLifecycleState(pkg.packageId)).toBe('SUPERSEDED');

    // SUPERSEDED is strictly terminal; cannot transition further
    await expect(
      adapter.appendLifecycleEvent(pkg.packageId, 'PUBLICATION_ISSUED', {}, 'fp_invalid')
    ).rejects.toThrow();
  });

  it('5. 4-Tier Projection: Tier 3 Student Live Test strips answers and scoring DAGs', async () => {
    const q = createCandidate({ candidateId: 'c_proj', physicalInstanceId: 'inst_proj' });
    const qgraph = createQuestionGraph([q]);
    const pkg = orchestrator.executePipeline({ questionGraph: qgraph, strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    // Verify that omitting security context throws ProjectionAuthorizationError
    await expect(
      (projectionGateway as any).getTier3StudentLiveProjection(pkg.packageId)
    ).rejects.toThrow('AUTH_CONTEXT_REQUIRED');

    // Verify that attempting to pass isInternalAudit to candidate-facing endpoint fails closed
    await expect(
      (projectionGateway as any).getTier3StudentLiveProjection(pkg.packageId, {
        isInternalAudit: true,
        auditReason: 'malicious candidate bypass attempt',
      })
    ).rejects.toThrow('PRIVILEGED_BYPASS_FORBIDDEN');

    const verifiedAuditContext = {
      isVerifiedPrivilegedAudit: true as const,
      staffUserId: 'staff_system_auditor',
      role: 'system_auditor' as const,
      purpose: 'SYSTEM_CERTIFICATION' as const,
      authorizedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      auditSignature: 'sig_valid_audit',
    };

    const liveProjection = await projectionGateway.getTier3LiveProjectionForInternalAudit(
      pkg.packageId,
      verifiedAuditContext
    );

    expect(liveProjection.projectionTier).toBe('TIER_3_STUDENT_LIVE');
    expect(liveProjection.questions.length).toBe(1);

    const question = liveProjection.questions[0];
    expect((question as any).authoritativeAnswer).toBeUndefined();
    expect((question as any).scoringRules).toBeUndefined();
    expect((question as any).sourceDiscrepancies).toBeUndefined();

    // Tier 2 Staff Review exposes discrepancies via internal audit method
    const staffProjection = await projectionGateway.getTier2StaffReviewProjectionForInternalAudit(
      pkg.packageId,
      verifiedAuditContext
    );
    expect(staffProjection.projectionTier).toBe('TIER_2_STAFF_REVIEW');
    expect(staffProjection.questions[0].sourceDiscrepancies).toBeDefined();
  });

  it('6. Tenancy & RLS: Enforces visibility boundaries between organizations', async () => {
    const q = createCandidate({ candidateId: 'c_tenant', physicalInstanceId: 'inst_tenant' });
    const qgraph = createQuestionGraph([q]);
    const pkg = orchestrator.executePipeline({ questionGraph: qgraph, strictValidation: true }).package!;

    await adapter.persistPackage(pkg, {
      tenantId: 'tenant_alpha',
      organizationId: 'org_alpha',
      visibilityScope: 'ORGANIZATION_PRIVATE',
    });

    // Same tenant accesses successfully
    const allowed = adapter.getPackageWithTenancyCheck(pkg.packageId, 'tenant_alpha');
    expect(allowed.package_id).toBe(pkg.packageId);

    // Different tenant is rejected by RLS
    expect(() => adapter.getPackageWithTenancyCheck(pkg.packageId, 'tenant_beta')).toThrow(
      TenancyAccessError
    );
  });

  it('7. Universal Content-Addressed Asset Registry: Deduplicates globally and validates integrity', () => {
    const buffer1 = Buffer.from('diagram-png-content-bytes-1');
    const buffer2 = Buffer.from('diagram-png-content-bytes-1'); // Exact duplicate
    const buffer3 = Buffer.from('diagram-png-content-bytes-2'); // Distinct

    const asset1 = assetRegistry.registerAsset(buffer1, 'image/png', { exam: 'UPSC', year: 2023 });
    const asset2 = assetRegistry.registerAsset(buffer2, 'image/png', { exam: 'SSC', year: 2024 });
    const asset3 = assetRegistry.registerAsset(buffer3, 'image/png', { exam: 'GATE', year: 2024 });

    // asset1 and asset2 must have identical contentHash and shared storage URI
    expect(asset1.contentHash).toBe(asset2.contentHash);
    expect(asset1.storageUri).toBe(asset2.storageUri);
    expect(assetRegistry.getTotalAssetCount()).toBe(2);

    // Mismatched hash assertion fails closed
    expect(() =>
      assetRegistry.registerAsset(buffer1, 'image/png', {}, 'tampered_sha256_hash_here')
    ).toThrow(AssetIntegrityError);
  });
});
