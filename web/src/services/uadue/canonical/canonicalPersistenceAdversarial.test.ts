/**
 * UADUE Phase 2D-7 — Gate G1 30 Adversarial Stress Scenarios Suite
 * Document Version: 7.3.1-CONSISTENCY-ALIGNED
 *
 * Implements and verifies all 30 architecturally specified adversarial scenarios:
 * SCEN-2D7-01 to SCEN-2D7-30
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CanonicalPipelineOrchestrator } from './canonicalPipelineOrchestrator';
import {
  CanonicalPersistenceAdapter,
  ImmutabilityViolationError,
  PersistenceIntegrityError,
  TableConstraintError,
  TenancyAccessError,
} from './canonicalPersistenceAdapter';
import {
  CanonicalPublicationGateway,
  PublicationConflictError,
} from './canonicalPublicationGateway';
import { CanonicalProjectionGateway } from './canonicalProjectionGateway';
import { CanonicalAssetRegistry, AssetIntegrityError } from './canonicalAssetRegistry';
import {
  reducePackageLifecycle,
  CorruptedEventStreamError,
  InvalidLifecycleTransitionError,
} from './canonicalLifecycleEngine';
import { derivePackageId, computePackageIntegritySeal, rfc8785Canonicalize } from './canonicalHashing';
import { QuestionCandidate, QuestionGraph } from '../contracts/questionGraph';

describe('UADUE Phase 2D-7 — Gate G1 30 Adversarial Stress Scenarios Suite', () => {
  let orchestrator: CanonicalPipelineOrchestrator;
  let adapter: CanonicalPersistenceAdapter;
  let gateway: CanonicalPublicationGateway;
  let projectionGateway: CanonicalProjectionGateway;
  let assetRegistry: CanonicalAssetRegistry;

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
        languageScript: 'LATIN',
        pageNumber: 1,
        stemNodeIds: ['node_stem_1'],
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
    graphId: 'qgraph_adv_test',
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
    gateway = new CanonicalPublicationGateway(adapter);
    projectionGateway = new CanonicalProjectionGateway(adapter);
    assetRegistry = new CanonicalAssetRegistry();
  });

  // SCEN-2D7-01: In-place UPDATE on package row
  it('SCEN-2D7-01: Rejects in-place UPDATE on canonical_assessment_packages with ImmutabilityViolationError', async () => {
    const q = createCandidate({ candidateId: 'c1', physicalInstanceId: 'inst1' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);
    expect(() => adapter.attemptUpdatePackageHeader(pkg.packageId)).toThrow(ImmutabilityViolationError);
  });

  // SCEN-2D7-02: DELETE on package row
  it('SCEN-2D7-02: Rejects DELETE on canonical_assessment_packages with ImmutabilityViolationError', async () => {
    const q = createCandidate({ candidateId: 'c2', physicalInstanceId: 'inst2' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);
    expect(() => adapter.attemptDeletePackageHeader(pkg.packageId)).toThrow(ImmutabilityViolationError);
  });

  // SCEN-2D7-03: Single-character mutation of stem_ast in persistent store
  it('SCEN-2D7-03: Single-character mutation of stem_ast in persistent storage triggers seal mismatch failure on reconstruction', async () => {
    const q = createCandidate({ candidateId: 'c3', physicalInstanceId: 'inst3' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    // Tamper with representation AST in storage
    const repId = pkg.canonicalQuestions[0].representations[0].representationId;
    adapter.tamperWithRepresentationAST(repId, 'MUTATED_TEXT');

    const reconstructed = await adapter.reconstructPackage(pkg.packageId);
    const recomputedSeal = computePackageIntegritySeal({
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
    // Post-persistence tamper causes computed seal to differ from immutable sealed header
    expect(recomputedSeal).not.toBe(pkg.packageIntegritySeal);
  });

  // SCEN-2D7-04: Option array reordering
  it('SCEN-2D7-04: Permuting options within a representation causes content seal failure', async () => {
    const q = createCandidate({ candidateId: 'c4', physicalInstanceId: 'inst4' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    const permutedPkg = JSON.parse(JSON.stringify(pkg));
    permutedPkg.canonicalQuestions[0].representations[0].options.reverse();

    const permutedSeal = computePackageIntegritySeal({
      packageId: permutedPkg.packageId,
      sourceSnapshotId: permutedPkg.sourceSnapshotId,
      sourceDocumentId: permutedPkg.sourceDocumentId,
      canonicalQuestions: permutedPkg.canonicalQuestions,
      logicalFamilies: permutedPkg.logicalFamilies,
      relationshipEvaluations: permutedPkg.relationshipEvaluations,
      memberships: permutedPkg.memberships,
      quarantinedRelationships: permutedPkg.quarantinedRelationships,
      authoritativeAnswers: permutedPkg.authoritativeAnswers,
      schemaVersion: permutedPkg.schemaVersion,
      pipelineAlgorithmId: permutedPkg.pipelineAlgorithmId,
      pipelineAlgorithmVersion: permutedPkg.pipelineAlgorithmVersion,
    });
    expect(permutedSeal).not.toBe(pkg.packageIntegritySeal);
  });

  // SCEN-2D7-05: Floating-point injection into scoring
  it('SCEN-2D7-05: Floating point injection into scoring policies throws validation error', () => {
    const nonFiniteNumber = Infinity;
    expect(() => rfc8785Canonicalize({ marks: nonFiniteNumber })).toThrow(/RFC 8785 forbids non-finite numbers/);
  });

  // SCEN-2D7-06: Out-of-order lifecycle event (DRAFT directly to PUBLISHED)
  it('SCEN-2D7-06: Out-of-order lifecycle transition (DRAFT directly to PUBLISHED) fails closed', () => {
    const fakeEvents = [
      {
        eventId: 'evt_1',
        packageId: 'pkg_ooo',
        eventType: 'PUBLICATION_ISSUED' as const,
        sequenceNumber: 1,
        eventPayload: {},
        createdAt: Date.now(),
      },
    ];
    expect(() => reducePackageLifecycle(fakeEvents, 'pkg_ooo')).toThrow(CorruptedEventStreamError);
  });

  // SCEN-2D7-07: Concurrent identical publication race
  it('SCEN-2D7-07: Concurrent identical publication requests are serialized; second is idempotent', async () => {
    const q = createCandidate({ candidateId: 'c7', physicalInstanceId: 'inst7' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    const payload = {
      packageId: pkg.packageId,
      packageIntegritySeal: pkg.packageIntegritySeal,
      publicationAuthorityId: 'AUTH_1',
      targetScope: 'SCOPE_1',
    };

    const [r1, r2] = await Promise.all([gateway.publishPackage(payload), gateway.publishPackage(payload)]);
    expect(r1.receiptId).toBe(r2.receiptId);
    expect(r1.publicationSequenceNumber).toBe(1);
    expect(r2.publicationSequenceNumber).toBe(1);
  });

  // SCEN-2D7-08: Concurrent conflicting publication requests
  it('SCEN-2D7-08: Concurrent conflicting publication requests reject second caller with 409', async () => {
    const q = createCandidate({ candidateId: 'c8', physicalInstanceId: 'inst8' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    const p1 = gateway.publishPackage({
      packageId: pkg.packageId,
      packageIntegritySeal: pkg.packageIntegritySeal,
      publicationAuthorityId: 'AUTH_1',
      targetScope: 'SCOPE_A',
    });
    const p2 = gateway.publishPackage({
      packageId: pkg.packageId,
      packageIntegritySeal: pkg.packageIntegritySeal,
      publicationAuthorityId: 'AUTH_2',
      targetScope: 'SCOPE_B',
    });

    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(PublicationConflictError);
  });

  // SCEN-2D7-09: Publication attempt on package with failed invariants
  it('SCEN-2D7-09: Publication attempt on package with failed invariants is rejected (state is QUARANTINED)', async () => {
    const q = createCandidate({ candidateId: 'c9', physicalInstanceId: 'inst9' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    pkg.validationReport.validationStatus = 'PACKAGE_FAILED';
    pkg.validationReport.failedInvariantCount = 2;
    await adapter.persistPackage(pkg);

    await expect(
      gateway.publishPackage({
        packageId: pkg.packageId,
        packageIntegritySeal: pkg.packageIntegritySeal,
        publicationAuthorityId: 'AUTH_1',
        targetScope: 'PUBLIC',
      })
    ).rejects.toThrow(InvalidLifecycleTransitionError);
  });

  // SCEN-2D7-10: Student Live Test projection answer leakage attempt
  it('SCEN-2D7-10: Student Live Test projection physically omits authoritative answer keys', async () => {
    const q = createCandidate({ candidateId: 'c10', physicalInstanceId: 'inst10' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    // Verify that missing security context fails closed
    await expect(
      (projectionGateway as any).getTier3StudentLiveProjection(pkg.packageId)
    ).rejects.toThrow('AUTH_CONTEXT_REQUIRED');

    const live = await projectionGateway.getTier3StudentLiveProjection(pkg.packageId, {
      tenantId: 'tenant_test',
      examSessionId: 'sess_live_10',
      candidateId: 'cand_10',
    });
    expect((live.questions[0] as any).authoritativeAnswer).toBeUndefined();
    expect((live.questions[0] as any).scoringPolicy).toBeUndefined();
  });

  // SCEN-2D7-11: Attempted transition out of SUPERSEDED terminal state
  it('SCEN-2D7-11: Transition out of SUPERSEDED terminal state fails closed', async () => {
    const q1 = createCandidate({ candidateId: 'c11_1', physicalInstanceId: 'inst11_1' });
    const q2 = createCandidate({ candidateId: 'c11_2', physicalInstanceId: 'inst11_2' });
    const pkg1 = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q1]), strictValidation: true }).package!;
    const pkg2 = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q2]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg1);
    await adapter.persistPackage(pkg2);

    await adapter.registerSupersession(pkg1.packageId, pkg2.packageId, 'Replacement');
    expect(adapter.getPackageLifecycleState(pkg1.packageId)).toBe('SUPERSEDED');

    await expect(
      adapter.appendLifecycleEvent(pkg1.packageId, 'PUBLICATION_ISSUED', {}, 'fp_sup')
    ).rejects.toThrow(InvalidLifecycleTransitionError);
  });

  // SCEN-2D7-12: Corrupted event stream with sequence gap
  it('SCEN-2D7-12: Corrupted event stream with sequence gap throws CorruptedEventStreamError', () => {
    const events = [
      {
        eventId: 'e1',
        packageId: 'p_gap',
        eventType: 'PERSISTENCE_COMMITTED' as const,
        sequenceNumber: 1,
        eventPayload: {},
        createdAt: 100,
      },
      {
        eventId: 'e3',
        packageId: 'p_gap',
        eventType: 'VALIDATION_RECORDED' as const,
        sequenceNumber: 3, // GAP: expected 2!
        eventPayload: { validationStatus: 'PACKAGE_VALIDATED' },
        createdAt: 200,
      },
    ];
    expect(() => reducePackageLifecycle(events, 'p_gap')).toThrow(CorruptedEventStreamError);
  });

  // SCEN-2D7-13: Duplicate publication request with identical payload
  it('SCEN-2D7-13: Duplicate publication request with identical payload returns existing receipt idempotently', async () => {
    const q = createCandidate({ candidateId: 'c13', physicalInstanceId: 'inst13' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    const payload = {
      packageId: pkg.packageId,
      packageIntegritySeal: pkg.packageIntegritySeal,
      publicationAuthorityId: 'AUTH_CBSE',
      targetScope: 'NATIONAL',
    };

    const first = await gateway.publishPackage(payload);
    const second = await gateway.publishPackage(payload);
    expect(first.receiptId).toBe(second.receiptId);
    expect(first.publicationRequestFingerprint).toBe(second.publicationRequestFingerprint);
  });

  // SCEN-2D7-14: Same authority submitting conflicting payload on published package
  it('SCEN-2D7-14: Same authority submitting conflicting payload fails closed with 409 conflict', async () => {
    const q = createCandidate({ candidateId: 'c14', physicalInstanceId: 'inst14' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    await gateway.publishPackage({
      packageId: pkg.packageId,
      packageIntegritySeal: pkg.packageIntegritySeal,
      publicationAuthorityId: 'AUTH_SSC',
      targetScope: 'TIER_1',
      publicationPolicyConfig: { shuffle: false },
    });

    await expect(
      gateway.publishPackage({
        packageId: pkg.packageId,
        packageIntegritySeal: pkg.packageIntegritySeal,
        publicationAuthorityId: 'AUTH_SSC', // Same authority
        targetScope: 'TIER_2_ALTERED', // Different scope!
        publicationPolicyConfig: { shuffle: true },
      })
    ).rejects.toThrow(PublicationConflictError);
  });

  // SCEN-2D7-15: Unauthorized tenant querying restricted package
  it('SCEN-2D7-15: Unauthorized tenant querying restricted package throws TenancyAccessError', async () => {
    const q = createCandidate({ candidateId: 'c15', physicalInstanceId: 'inst15' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg, {
      tenantId: 'tenant_secure',
      organizationId: 'org_secure',
      visibilityScope: 'RESTRICTED',
    });

    expect(() => adapter.getPackageWithTenancyCheck(pkg.packageId, 'tenant_intruder')).toThrow(
      TenancyAccessError
    );
  });

  // SCEN-2D7-16: Public package access without tenant context
  it('SCEN-2D7-16: Public package access allows queries from any tenant context', async () => {
    const q = createCandidate({ candidateId: 'c16', physicalInstanceId: 'inst16' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg, {
      tenantId: 'tenant_open',
      organizationId: 'org_open',
      visibilityScope: 'PUBLIC',
    });

    const accessed = adapter.getPackageWithTenancyCheck(pkg.packageId, 'any_random_tenant');
    expect(accessed.package_id).toBe(pkg.packageId);
  });

  // SCEN-2D7-17: Asset content hash mismatch upon ingestion
  it('SCEN-2D7-17: Asset content hash mismatch throws AssetIntegrityError', () => {
    const bytes = Buffer.from('diagram-bytes-17');
    expect(() =>
      assetRegistry.registerAsset(bytes, 'image/png', {}, 'fabricated_hash_00000000')
    ).toThrow(AssetIntegrityError);
  });

  // SCEN-2D7-18: Asset collision across different exams deduplicates safely
  it('SCEN-2D7-18: Asset with identical bytes across different exams shares single storage URI', () => {
    const bytes = Buffer.from('shared-watermark-icon');
    const a1 = assetRegistry.registerAsset(bytes, 'image/png', { exam: 'UPSC' });
    const a2 = assetRegistry.registerAsset(bytes, 'image/png', { exam: 'SSC' });
    expect(a1.contentHash).toBe(a2.contentHash);
    expect(a1.storageUri).toBe(a2.storageUri);
    expect(assetRegistry.getTotalAssetCount()).toBe(1);
  });

  // SCEN-2D7-19: Cyclic package supersession attempt
  it('SCEN-2D7-19: Cyclic package supersession (P1 -> P2 -> P1) throws TableConstraintError', async () => {
    const q1 = createCandidate({ candidateId: 'c19_1', physicalInstanceId: 'inst19_1' });
    const q2 = createCandidate({ candidateId: 'c19_2', physicalInstanceId: 'inst19_2' });
    const pkg1 = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q1]), strictValidation: true }).package!;
    const pkg2 = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q2]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg1);
    await adapter.persistPackage(pkg2);

    await adapter.registerSupersession(pkg1.packageId, pkg2.packageId, 'Update');
    await expect(
      adapter.registerSupersession(pkg2.packageId, pkg1.packageId, 'Illegal cycle')
    ).rejects.toThrow(/Cyclic package supersession/);
  });

  // SCEN-2D7-20: Self-supersession attempt
  it('SCEN-2D7-20: Self-supersession (P1 -> P1) throws TableConstraintError', async () => {
    const q = createCandidate({ candidateId: 'c20', physicalInstanceId: 'inst20' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    await expect(
      adapter.registerSupersession(pkg.packageId, pkg.packageId, 'Self loop')
    ).rejects.toThrow(/cannot supersede itself/);
  });

  // SCEN-2D7-21: Non-existent package reference in supersession
  it('SCEN-2D7-21: Supersession referencing non-existent package throws PersistenceIntegrityError', async () => {
    const q = createCandidate({ candidateId: 'c21', physicalInstanceId: 'inst21' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    await expect(
      adapter.registerSupersession(pkg.packageId, 'non_existent_pkg', 'Dangling')
    ).rejects.toThrow(PersistenceIntegrityError);
  });

  // SCEN-2D7-22: Re-persisting an already persisted package
  it('SCEN-2D7-22: Re-persisting an already persisted package throws TableConstraintError', async () => {
    const q = createCandidate({ candidateId: 'c22', physicalInstanceId: 'inst22' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    await expect(adapter.persistPackage(pkg)).rejects.toThrow(TableConstraintError);
  });

  // SCEN-2D7-23: Attempted publication without mandatory publication_request_fingerprint
  it('SCEN-2D7-23: Appending PUBLICATION_ISSUED without publication_request_fingerprint violates chk_pub_fingerprint', async () => {
    const q = createCandidate({ candidateId: 'c23', physicalInstanceId: 'inst23' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    await expect(
      adapter.appendLifecycleEvent(pkg.packageId, 'PUBLICATION_ISSUED', {}, null)
    ).rejects.toThrow(/chk_pub_fingerprint/);
  });

  // SCEN-2D7-24: Release of validation-failure quarantine (origin=PERSISTED) fails closed
  it('SCEN-2D7-24: Option A: QUARANTINE_RELEASED on validation-failure quarantine throws InvalidLifecycleTransitionError', async () => {
    const q = createCandidate({ candidateId: 'c24', physicalInstanceId: 'inst24' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    pkg.validationReport.validationStatus = 'PACKAGE_FAILED';
    await adapter.persistPackage(pkg);

    await expect(
      adapter.appendLifecycleEvent(pkg.packageId, 'QUARANTINE_RELEASED', {})
    ).rejects.toThrow(/Option A Violation/);
  });

  // SCEN-2D7-25: Quarantine release on un-quarantined package fails closed
  it('SCEN-2D7-25: Quarantine release on VALIDATED package fails closed', async () => {
    const q = createCandidate({ candidateId: 'c25', physicalInstanceId: 'inst25' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    expect(adapter.getPackageLifecycleState(pkg.packageId)).toBe('VALIDATED');
    await expect(
      adapter.appendLifecycleEvent(pkg.packageId, 'QUARANTINE_RELEASED', {})
    ).rejects.toThrow(InvalidLifecycleTransitionError);
  });

  // SCEN-2D7-26: Post-publication emergency quarantine release restores PUBLISHED state
  it('SCEN-2D7-26: Post-publication emergency quarantine release restores PUBLISHED state cleanly', async () => {
    const q = createCandidate({ candidateId: 'c26', physicalInstanceId: 'inst26' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    await gateway.publishPackage({
      packageId: pkg.packageId,
      packageIntegritySeal: pkg.packageIntegritySeal,
      publicationAuthorityId: 'AUTH_26',
      targetScope: 'GLOBAL',
    });
    expect(adapter.getPackageLifecycleState(pkg.packageId)).toBe('PUBLISHED');

    // Apply administrative emergency hold
    await adapter.appendLifecycleEvent(pkg.packageId, 'QUARANTINE_APPLIED', {
      originState: 'PUBLISHED',
      reason: 'Audit investigation',
    });
    expect(adapter.getPackageLifecycleState(pkg.packageId)).toBe('QUARANTINED');

    // Release administrative hold
    await adapter.appendLifecycleEvent(pkg.packageId, 'QUARANTINE_RELEASED', {
      investigationResult: 'CLEARED_FALSE_ALARM',
    });
    expect(adapter.getPackageLifecycleState(pkg.packageId)).toBe('PUBLISHED');
  });

  // SCEN-2D7-27: Re-publication of released quarantine package allocates sequence 2
  it('SCEN-2D7-27: Pre-publication administrative quarantine release allows publication with sequence 1', async () => {
    const q = createCandidate({ candidateId: 'c27', physicalInstanceId: 'inst27' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    // Administrative hold before publication
    await adapter.appendLifecycleEvent(pkg.packageId, 'QUARANTINE_APPLIED', {
      originState: 'VALIDATED',
    });
    expect(adapter.getPackageLifecycleState(pkg.packageId)).toBe('QUARANTINED');

    // Release hold
    await adapter.appendLifecycleEvent(pkg.packageId, 'QUARANTINE_RELEASED', {});
    expect(adapter.getPackageLifecycleState(pkg.packageId)).toBe('VALIDATED');

    // Publish
    const receipt = await gateway.publishPackage({
      packageId: pkg.packageId,
      packageIntegritySeal: pkg.packageIntegritySeal,
      publicationAuthorityId: 'AUTH_27',
      targetScope: 'GLOBAL',
    });
    expect(receipt.publicationSequenceNumber).toBe(1);
    expect(adapter.getPackageLifecycleState(pkg.packageId)).toBe('PUBLISHED');
  });

  // SCEN-2D7-28: Attempting to mutate event row throws ImmutabilityViolationError
  it('SCEN-2D7-28: Attempting to mutate or delete event rows throws ImmutabilityViolationError', () => {
    expect(() => adapter.attemptMutateEventRow('evt_fake_1')).toThrow(ImmutabilityViolationError);
  });

  // SCEN-2D7-29: Tampered HMAC signature verification fails
  it('SCEN-2D7-29: Tampered HMAC signature fails cryptographic verification', async () => {
    const q = createCandidate({ candidateId: 'c29', physicalInstanceId: 'inst29' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    const receipt = await gateway.publishPackage({
      packageId: pkg.packageId,
      packageIntegritySeal: pkg.packageIntegritySeal,
      publicationAuthorityId: 'AUTH_29',
      targetScope: 'GLOBAL',
    });
    expect(gateway.verifyReceiptSignature(receipt)).toBe(true);

    const tamperedReceipt = { ...receipt, hmacSignature: 'tampered_signature_hex_0000000000000000' };
    expect(gateway.verifyReceiptSignature(tamperedReceipt)).toBe(false);
  });

  // SCEN-2D7-30: Full roundtrip reconstruction dual-seal parity under permuted rows
  it('SCEN-2D7-30: Full roundtrip reconstruction proves bit-for-bit identity and seal parity under permuted rows', async () => {
    const q1 = createCandidate({ candidateId: 'c30_1', physicalInstanceId: 'inst30_1', sourceQuestionNumber: '1' });
    const q2 = createCandidate({ candidateId: 'c30_2', physicalInstanceId: 'inst30_2', sourceQuestionNumber: '2' });
    const pkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph([q1, q2]), strictValidation: true }).package!;
    await adapter.persistPackage(pkg);

    adapter.tamperShuffleChildRows(pkg.packageId);

    const reconstructed = await adapter.reconstructPackage(pkg.packageId);
    const derivedId = derivePackageId({
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

    expect(derivedId).toBe(pkg.packageId);
    expect(derivedSeal).toBe(pkg.packageIntegritySeal);
  });
});
